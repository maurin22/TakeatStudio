import { type RefObject, useEffect } from "react";
import { mergeHudInteractiveBounds } from "../hudMousePassthrough";

/** folga em volta da barra para a sombra não ser cortada (DIP) */
const FIT_PADDING_DIP = 16;

const toBounds = (rect: DOMRect | undefined) =>
	rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;

/**
 * Gravando, pede para a janela do HUD ficar do tamanho da barra (e da câmera, quando aparece).
 * Sem área transparente sobrando por cima da tela, o clique fora da barra chega nos outros
 * programas, e a barra continua sempre clicável. A barra fica no centro de baixo da janela:
 * a largura cresce para os dois lados e a altura vai do topo do conteúdo até a base.
 */
export function useRecordingHudFit({
	active,
	hudBarRef,
	webcamRef,
	webcamVisible,
}: {
	active: boolean;
	hudBarRef: RefObject<HTMLDivElement>;
	webcamRef: RefObject<HTMLDivElement>;
	webcamVisible: boolean;
}) {
	useEffect(() => {
		if (!active) {
			return;
		}

		let raf: number | null = null;
		const measure = () => {
			raf = null;
			const bounds = mergeHudInteractiveBounds([
				toBounds(hudBarRef.current?.getBoundingClientRect()),
				toBounds(webcamRef.current?.getBoundingClientRect()),
			]);
			if (!bounds) {
				return;
			}

			const center = window.innerWidth / 2;
			const halfWidth = Math.max(center - bounds.left, bounds.right - center);
			const size = {
				width: Math.ceil(halfWidth * 2 + FIT_PADDING_DIP * 2),
				height: Math.ceil(window.innerHeight - bounds.top + FIT_PADDING_DIP),
			};
			// compara com o tamanho real da janela: se algo a redimensionar (ex.: o atalho de
			// emergência), ela volta a ficar do tamanho certo
			if (
				Math.abs(size.width - window.innerWidth) < 2 &&
				Math.abs(size.height - window.innerHeight) < 2
			) {
				return;
			}
			window.electronAPI?.hudOverlayFitRecording?.(size);
		};
		const schedule = () => {
			if (raf === null) {
				raf = requestAnimationFrame(measure);
			}
		};

		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
		if (hudBarRef.current) {
			observer?.observe(hudBarRef.current);
		}
		// a câmera monta e desmonta durante a gravação: com ela visível, observa o tamanho dela também
		if (webcamVisible && webcamRef.current) {
			observer?.observe(webcamRef.current);
		}
		window.addEventListener("resize", schedule);
		// a câmera pode ser arrastada dentro do HUD: mede de novo ao soltar
		window.addEventListener("pointerup", schedule);
		schedule();
		// a barra anima ao entrar no modo de gravação: mede de novo quando a animação termina
		const settle = window.setTimeout(schedule, 400);

		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", schedule);
			window.removeEventListener("pointerup", schedule);
			window.clearTimeout(settle);
			if (raf !== null) {
				cancelAnimationFrame(raf);
			}
		};
	}, [active, hudBarRef, webcamRef, webcamVisible]);
}
