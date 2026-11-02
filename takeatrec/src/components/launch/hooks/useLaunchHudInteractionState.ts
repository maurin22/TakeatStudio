import { type MouseEvent, type RefObject, useCallback, useEffect, useRef } from "react";

export function useLaunchHudInteractionState({
	openId,
	isHudDraggingRef,
	isWebcamPreviewDraggingRef,
	webcamPreviewDragStartRef,
}: {
	openId: string | null;
	isHudDraggingRef: RefObject<boolean>;
	isWebcamPreviewDraggingRef: RefObject<boolean>;
	webcamPreviewDragStartRef: RefObject<unknown>;
}) {
	const isMouseOverHudRef = useRef(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (openId !== null) {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
		} else {
			// Proactively check if we should ignore mouse when popover closes
			setTimeout(() => {
				if (!isMouseOverHudRef.current) {
					window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
				}
			}, 150);
		}
	}, [openId]);

	useEffect(() => {
		const handleMouseOver = (e: globalThis.MouseEvent) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const isInteractive = !!target.closest(
				".pointer-events-auto, [data-hud-interactive], [data-radix-popper-content-wrapper]",
			);

			if (isInteractive) {
				isMouseOverHudRef.current = true;
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
				window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
			} else if (openId === null) {
				isMouseOverHudRef.current = false;
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
				timeoutRef.current = setTimeout(() => {
					if (
						openId === null &&
						!isHudDraggingRef.current &&
						!isWebcamPreviewDraggingRef.current &&
						!webcamPreviewDragStartRef.current &&
						!isMouseOverHudRef.current
					) {
						window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
					}
				}, 300);
			}
		};

		window.addEventListener("mouseover", handleMouseOver);
		return () => window.removeEventListener("mouseover", handleMouseOver);
	}, [openId, isHudDraggingRef, isWebcamPreviewDraggingRef, webcamPreviewDragStartRef]);

	// Informa ao processo principal onde ficam as partes clicáveis (barra,
	// popovers, câmera, avisos). Ele usa isso para soltar o clique da tela
	// quando o cursor está longe da barra, mesmo que este renderer perca o
	// evento de mouseover — antes disso a janela de tela cheia podia ficar
	// sólida e travar o PC inteiro.
	useEffect(() => {
		let lastPayload = "";
		const report = () => {
			const viewportArea = window.innerWidth * window.innerHeight;
			const rects = Array.from(
				document.querySelectorAll<HTMLElement>(
					".pointer-events-auto, [data-hud-interactive], [data-radix-popper-content-wrapper], [data-sonner-toast]",
				),
			)
				.map((element) => element.getBoundingClientRect())
				// nada que cubra quase a janela toda conta como "barra": isso
				// recriaria o travamento que a vigia existe para impedir
				.filter(
					(rect) =>
						rect.width > 0 &&
						rect.height > 0 &&
						rect.width * rect.height < viewportArea * 0.6,
				)
				.map((rect) => ({
					x: Math.round(rect.left),
					y: Math.round(rect.top),
					width: Math.round(rect.width),
					height: Math.round(rect.height),
				}));
			const hold = Boolean(
				isHudDraggingRef.current ||
					isWebcamPreviewDraggingRef.current ||
					webcamPreviewDragStartRef.current,
			);
			const payload = JSON.stringify([rects, hold]);
			if (payload === lastPayload) return;
			lastPayload = payload;
			window.electronAPI?.hudOverlayReportInteractiveRects?.(rects, hold);
		};

		report();
		const interval = window.setInterval(report, 200);
		return () => window.clearInterval(interval);
	}, [isHudDraggingRef, isWebcamPreviewDraggingRef, webcamPreviewDragStartRef]);

	const beginInteractiveHudAction = useCallback(() => {
		isMouseOverHudRef.current = true;
		window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
	}, []);

	const handleHudMouseEnter = useCallback(() => {
		isMouseOverHudRef.current = true;
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
	}, []);

	const handleHudMouseLeave = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			const nextTarget = event.relatedTarget;
			if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
				return;
			}

			isMouseOverHudRef.current = false;

			if (timeoutRef.current) clearTimeout(timeoutRef.current);

			timeoutRef.current = setTimeout(() => {
				if (
					openId === null &&
					!isHudDraggingRef.current &&
					!isWebcamPreviewDraggingRef.current &&
					!webcamPreviewDragStartRef.current &&
					!isMouseOverHudRef.current
				) {
					window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
				}
			}, 300);
		},
		[openId, isHudDraggingRef, isWebcamPreviewDraggingRef, webcamPreviewDragStartRef],
	);

	return {
		handleHudMouseEnter,
		handleHudMouseLeave,
		beginInteractiveHudAction,
	};
}
