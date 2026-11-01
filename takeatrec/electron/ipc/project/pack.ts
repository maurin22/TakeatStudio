import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Pacote portátil de projeto (.takeatpack): um arquivo só com o projeto e
 * todas as mídias que ele usa (vídeo, cursor, câmera, áudios), pra editar
 * depois ou abrir em outro computador.
 *
 * Formato (sem compressão — vídeo e áudio já vêm comprimidos):
 *   8 bytes  "TKPACK01"
 *   4 bytes  tamanho do cabeçalho (uint32 little-endian)
 *   N bytes  cabeçalho JSON (utf-8)
 *   ...      bytes de cada arquivo, na ordem de `files`
 *
 * No cabeçalho, todo caminho absoluto de mídia dentro do projeto vira
 * `takeatpack://<nome>`, e é reescrito pro caminho novo ao importar.
 */
export const PROJECT_PACK_EXTENSION = "takeatpack";
const MAGIC = Buffer.from("TKPACK01", "ascii");
const PATH_TOKEN_PREFIX = "takeatpack://";
const MAX_HEADER_BYTES = 64 * 1024 * 1024;

interface PackHeader {
	format: "takeatpack";
	version: 1;
	createdAt: string;
	projectName: string;
	project: unknown;
	files: Array<{ name: string; size: number }>;
}

function samePath(a: string, b: string) {
	const na = path.resolve(a);
	const nb = path.resolve(b);
	return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** Caminhos de mídia citados explicitamente no projeto. */
export function collectProjectMediaPaths(project: unknown): string[] {
	const found: string[] = [];
	const obj = project as {
		videoPath?: unknown;
		editor?: {
			webcam?: { sourcePath?: unknown };
			audioTracks?: Array<{ sourcePath?: unknown }>;
			audioRegions?: Array<{ audioPath?: unknown }>;
		};
	};
	const push = (value: unknown) => {
		if (typeof value === "string" && value.trim() && path.isAbsolute(value)) found.push(value);
	};
	push(obj?.videoPath);
	push(obj?.editor?.webcam?.sourcePath);
	if (Array.isArray(obj?.editor?.audioTracks)) {
		for (const track of obj.editor.audioTracks) push(track?.sourcePath);
	}
	if (Array.isArray(obj?.editor?.audioRegions)) {
		for (const region of obj.editor.audioRegions) push(region?.audioPath);
	}
	return found;
}

function stripMediaExtension(fileName: string) {
	return fileName.replace(/\.[^.]+$/, "");
}

/**
 * Tudo que acompanha a gravação: as mídias do projeto e os arquivos irmãos
 * com o mesmo prefixo (cursor.json, câmera, microfone, sessão...).
 */
export async function collectPackFiles(project: unknown): Promise<string[]> {
	const mediaPaths = collectProjectMediaPaths(project);
	const result: string[] = [];
	const add = (p: string) => {
		if (!result.some((existing) => samePath(existing, p))) result.push(p);
	};

	for (const mediaPath of mediaPaths) {
		try {
			await fs.access(mediaPath);
			add(mediaPath);
		} catch {
			continue;
		}
		const dir = path.dirname(mediaPath);
		const base = stripMediaExtension(path.basename(mediaPath));
		let siblings: string[] = [];
		try {
			siblings = await fs.readdir(dir);
		} catch {
			siblings = [];
		}
		for (const name of siblings) {
			if (name === path.basename(mediaPath)) continue;
			if (!(name.startsWith(`${base}.`) || name.startsWith(`${base}-`))) continue;
			const full = path.join(dir, name);
			try {
				if ((await fs.stat(full)).isFile()) add(full);
			} catch {
				// arquivo sumiu entre o readdir e o stat
			}
		}
	}
	return result;
}

/** Troca os caminhos absolutos do projeto pelos tokens do pacote (e vice-versa). */
function mapProjectStrings(value: unknown, mapper: (s: string) => string): unknown {
	if (typeof value === "string") return mapper(value);
	if (Array.isArray(value)) return value.map((item) => mapProjectStrings(item, mapper));
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) out[key] = mapProjectStrings(item, mapper);
		return out;
	}
	return value;
}

function uniqueEntryNames(filePaths: string[]): string[] {
	const used = new Set<string>();
	return filePaths.map((filePath) => {
		const base = path.basename(filePath);
		let name = base;
		let index = 2;
		while (used.has(name.toLowerCase())) {
			name = `${stripMediaExtension(base)}-${index}${path.extname(base)}`;
			index++;
		}
		used.add(name.toLowerCase());
		return name;
	});
}

export async function writeProjectPack(
	project: unknown,
	projectName: string,
	destinationPath: string,
): Promise<{ fileCount: number; totalBytes: number }> {
	const filePaths = await collectPackFiles(project);
	const videoPath = (project as { videoPath?: unknown })?.videoPath;
	if (typeof videoPath !== "string" || !filePaths.some((p) => samePath(p, videoPath))) {
		throw new Error("O vídeo do projeto não foi encontrado no computador.");
	}

	const names = uniqueEntryNames(filePaths);
	const sizes = await Promise.all(filePaths.map(async (p) => (await fs.stat(p)).size));
	const tokenizedProject = mapProjectStrings(project, (s) => {
		const index = filePaths.findIndex((p) => path.isAbsolute(s) && samePath(p, s));
		return index >= 0 ? `${PATH_TOKEN_PREFIX}${names[index]}` : s;
	});

	const header: PackHeader = {
		format: "takeatpack",
		version: 1,
		createdAt: new Date().toISOString(),
		projectName,
		project: tokenizedProject,
		files: names.map((name, i) => ({ name, size: sizes[i] })),
	};
	const headerBytes = Buffer.from(JSON.stringify(header), "utf-8");
	const lengthBytes = Buffer.alloc(4);
	lengthBytes.writeUInt32LE(headerBytes.length, 0);

	// escreve num temporário e só renomeia no fim: um pacote pela metade
	// nunca fica com o nome final
	const tempPath = `${destinationPath}.partial`;
	await fs.rm(tempPath, { force: true });
	const out = createWriteStream(tempPath);
	try {
		await new Promise<void>((resolve, reject) => {
			out.write(Buffer.concat([MAGIC, lengthBytes, headerBytes]), (err) =>
				err ? reject(err) : resolve(),
			);
		});
		for (const filePath of filePaths) {
			await pipeline(createReadStream(filePath), out, { end: false });
		}
		await new Promise<void>((resolve, reject) => {
			out.end((err?: Error | null) => (err ? reject(err) : resolve()));
		});
		await fs.rm(destinationPath, { force: true });
		await fs.rename(tempPath, destinationPath);
	} catch (error) {
		out.destroy();
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}

	return { fileCount: filePaths.length, totalBytes: sizes.reduce((a, b) => a + b, 0) };
}

async function readExactly(handle: fs.FileHandle, length: number, position: number) {
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await handle.read(buffer, 0, length, position);
	if (bytesRead !== length) throw new Error("Pacote incompleto ou corrompido.");
	return buffer;
}

export async function readProjectPackHeader(packPath: string): Promise<{
	header: PackHeader;
	dataOffset: number;
}> {
	const handle = await fs.open(packPath, "r");
	try {
		const magic = await readExactly(handle, MAGIC.length, 0);
		if (!magic.equals(MAGIC)) throw new Error("Este arquivo não é um pacote do Takeat Rec.");
		const headerLength = (await readExactly(handle, 4, MAGIC.length)).readUInt32LE(0);
		if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES) {
			throw new Error("Pacote corrompido (cabeçalho inválido).");
		}
		const header = JSON.parse(
			(await readExactly(handle, headerLength, MAGIC.length + 4)).toString("utf-8"),
		) as PackHeader;
		if (header?.format !== "takeatpack" || !Array.isArray(header.files)) {
			throw new Error("Pacote corrompido (formato desconhecido).");
		}
		const stat = await handle.stat();
		const dataOffset = MAGIC.length + 4 + headerLength;
		const expected = header.files.reduce((sum, f) => sum + f.size, dataOffset);
		if (stat.size !== expected) throw new Error("Pacote incompleto: o arquivo foi cortado no envio.");
		return { header, dataOffset };
	} finally {
		await handle.close();
	}
}

/**
 * Extrai as mídias pra `destinationDir` e devolve o projeto com os caminhos
 * apontando pros arquivos extraídos.
 */
export async function extractProjectPack(
	packPath: string,
	destinationDir: string,
): Promise<{ project: unknown; projectName: string }> {
	const { header, dataOffset } = await readProjectPackHeader(packPath);
	await fs.mkdir(destinationDir, { recursive: true });

	let offset = dataOffset;
	const extracted = new Map<string, string>();
	for (const file of header.files) {
		const safeName = path.basename(file.name);
		if (!safeName || safeName === "." || safeName === "..") {
			throw new Error("Pacote corrompido (nome de arquivo inválido).");
		}
		const target = path.join(destinationDir, safeName);
		if (file.size > 0) {
			await pipeline(
				createReadStream(packPath, { start: offset, end: offset + file.size - 1 }),
				createWriteStream(target),
			);
		} else {
			await fs.writeFile(target, "");
		}
		extracted.set(file.name, target);
		offset += file.size;
	}

	const project = mapProjectStrings(header.project, (s) => {
		if (!s.startsWith(PATH_TOKEN_PREFIX)) return s;
		return extracted.get(s.slice(PATH_TOKEN_PREFIX.length)) ?? s;
	});
	return { project, projectName: header.projectName || "Projeto importado" };
}
