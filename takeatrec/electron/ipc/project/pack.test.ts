import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractProjectPack, readProjectPackHeader, writeProjectPack } from "./pack";

const tempDirs: string[] = [];
async function tempDir() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "takeatpack-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function makeRecording() {
	// pasta com acento, como "Gravações" / "Área de Trabalho"
	const dir = path.join(await tempDir(), "Gravações");
	await fs.mkdir(dir, { recursive: true });
	const videoPath = path.join(dir, "recording-123.webm");
	const webcamPath = path.join(dir, "recording-123-webcam.mp4");
	const files: Record<string, Buffer> = {
		[videoPath]: Buffer.from("VIDEO-BYTES".repeat(5000)),
		[`${videoPath}.cursor.json`]: Buffer.from(JSON.stringify({ version: 2, samples: [{ t: 0, x: 1 }] })),
		[webcamPath]: Buffer.from("WEBCAM"),
		[path.join(dir, "recording-123.mic.wav")]: Buffer.from("MIC"),
		[path.join(dir, "recording-999.webm")]: Buffer.from("OUTRA GRAVACAO"),
	};
	for (const [p, data] of Object.entries(files)) await fs.writeFile(p, data);
	const project = {
		version: 1,
		videoPath,
		editor: { webcam: { sourcePath: webcamPath }, audioTracks: [], label: "não é caminho" },
	};
	return { dir, videoPath, webcamPath, files, project };
}

describe("project pack", () => {
	it("leva vídeo, cursor e arquivos irmãos e reescreve os caminhos ao abrir", async () => {
		const rec = await makeRecording();
		const packPath = path.join(await tempDir(), "meu projeto.takeatpack");

		const summary = await writeProjectPack(rec.project, "Meu projeto", packPath);
		expect(summary.fileCount).toBe(4); // vídeo, cursor, câmera, microfone — não a outra gravação

		const dest = path.join(await tempDir(), "outro pc");
		const { project, projectName } = await extractProjectPack(packPath, dest);
		const p = project as typeof rec.project;
		expect(projectName).toBe("Meu projeto");
		expect(p.videoPath).toBe(path.join(dest, "recording-123.webm"));
		expect(p.editor.webcam.sourcePath).toBe(path.join(dest, "recording-123-webcam.mp4"));
		expect(p.editor.label).toBe("não é caminho");

		for (const [original, data] of Object.entries(rec.files)) {
			const extracted = path.join(dest, path.basename(original));
			if (original.includes("recording-999")) {
				await expect(fs.access(extracted)).rejects.toThrow();
				continue;
			}
			expect((await fs.readFile(extracted)).equals(data)).toBe(true);
		}
	});

	it("recusa pacote cortado no envio", async () => {
		const rec = await makeRecording();
		const packPath = path.join(await tempDir(), "x.takeatpack");
		await writeProjectPack(rec.project, "x", packPath);
		const full = await fs.readFile(packPath);
		await fs.writeFile(packPath, full.subarray(0, full.length - 100));
		await expect(readProjectPackHeader(packPath)).rejects.toThrow(/incompleto/);
	});

	it("falha com mensagem clara se o vídeo sumiu", async () => {
		const rec = await makeRecording();
		await fs.rm(rec.videoPath);
		await expect(
			writeProjectPack(rec.project, "x", path.join(await tempDir(), "x.takeatpack")),
		).rejects.toThrow(/vídeo do projeto não foi encontrado/);
	});
});
