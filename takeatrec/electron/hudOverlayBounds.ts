export interface HudOverlayWorkArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

const NON_PASSTHROUGH_HUD_WIDTH_DIP = 860;
const NON_PASSTHROUGH_HUD_COMPACT_HEIGHT_DIP = 160;
const NON_PASSTHROUGH_HUD_EXPANDED_HEIGHT_DIP = 540;
const RECORDING_FIT_MIN_WIDTH_DIP = 120;
const RECORDING_FIT_MIN_HEIGHT_DIP = 48;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function getHudOverlayWindowBounds(
	workArea: HudOverlayWorkArea,
	mousePassthroughSupported: boolean,
	fallbackExpanded = false,
): HudOverlayWorkArea {
	if (mousePassthroughSupported) {
		return { ...workArea };
	}

	const width = Math.min(workArea.width, NON_PASSTHROUGH_HUD_WIDTH_DIP);
	const height = Math.min(
		workArea.height,
		fallbackExpanded
			? NON_PASSTHROUGH_HUD_EXPANDED_HEIGHT_DIP
			: NON_PASSTHROUGH_HUD_COMPACT_HEIGHT_DIP,
	);

	return {
		x: Math.round(workArea.x + (workArea.width - width) / 2),
		y: Math.round(workArea.y + workArea.height - height),
		width,
		height,
	};
}

export function shouldExpandHudOverlayFallback({
	fallbackExpanded,
	recordingActive,
	webcamPreviewVisible,
}: {
	fallbackExpanded: boolean;
	recordingActive: boolean;
	webcamPreviewVisible: boolean;
}): boolean {
	return fallbackExpanded || (recordingActive && webcamPreviewVisible);
}

export function resizeHudOverlayFallbackBounds(
	workArea: HudOverlayWorkArea,
	currentBounds: HudOverlayWorkArea,
	fallbackExpanded: boolean,
): HudOverlayWorkArea {
	const nextBounds = getHudOverlayWindowBounds(workArea, false, fallbackExpanded);
	const maxX = workArea.x + workArea.width - nextBounds.width;
	const maxY = workArea.y + workArea.height - nextBounds.height;

	return {
		...nextBounds,
		x: clamp(currentBounds.x, workArea.x, maxX),
		y: clamp(currentBounds.y + currentBounds.height - nextBounds.height, workArea.y, maxY),
	};
}

/**
 * Gravando, a janela do HUD fica do tamanho da barra (mais a folga da sombra), e não do retângulo fixo
 * de 860x160: a parte transparente em volta ficava por cima da tela segurando os cliques de quem está
 * gravando. O tamanho novo ancora no centro de baixo da janela atual (não desfaz o arraste) e não sai da
 * área útil da tela. Devolve null quando não há o que mudar.
 */
export function fitHudOverlayToContent(
	currentBounds: HudOverlayWorkArea,
	workArea: HudOverlayWorkArea,
	contentSize: { width: number; height: number },
): HudOverlayWorkArea | null {
	if (!Number.isFinite(contentSize.width) || !Number.isFinite(contentSize.height)) {
		return null;
	}

	const width = Math.round(clamp(contentSize.width, RECORDING_FIT_MIN_WIDTH_DIP, workArea.width));
	const height = Math.round(clamp(contentSize.height, RECORDING_FIT_MIN_HEIGHT_DIP, workArea.height));
	if (Math.abs(width - currentBounds.width) < 2 && Math.abs(height - currentBounds.height) < 2) {
		return null;
	}

	return {
		x: Math.round(
			clamp(
				currentBounds.x + (currentBounds.width - width) / 2,
				workArea.x,
				workArea.x + workArea.width - width,
			),
		),
		y: Math.round(
			clamp(
				currentBounds.y + currentBounds.height - height,
				workArea.y,
				workArea.y + workArea.height - height,
			),
		),
		width,
		height,
	};
}
