/**
 * useExtensions — React hook for managing extensions in the editor.
 *
 * Handles discovery, activation/deactivation, marketplace browsing,
 * downloading, and provides the extension host instance to components
 * that need render hooks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ExtensionInfo,
	ExtensionReview,
	MarketplaceReviewStatus,
	MarketplaceSearchResult,
} from "@/lib/extensions";
import { extensionHost } from "@/lib/extensions";
import { createExtensionModuleUrl } from "@/lib/extensions/fileUrls";

const electronAPI = typeof window === "undefined" ? undefined : window.electronAPI;

export interface UseExtensionsResult {
	/** All discovered extensions */
	extensions: ExtensionInfo[];
	/** Currently active extension IDs */
	activeIds: Set<string>;
	/** Whether initial discovery is complete */
	ready: boolean;
	/** Discover/refresh extensions from disk */
	refresh: () => Promise<void>;
	/** Toggle an extension on/off */
	toggleExtension: (id: string) => Promise<void>;
	/** Install an extension from a folder */
	installFromFolder: () => Promise<boolean>;
	/** Uninstall an extension */
	uninstall: (id: string) => Promise<boolean>;
	/** Open the extensions directory in Finder/Explorer */
	openDirectory: () => Promise<void>;
	/** Search the marketplace */
	marketplaceSearch: (params: {
		query?: string;
		tags?: string[];
		sort?: "popular" | "recent" | "rating";
		page?: number;
		pageSize?: number;
	}) => Promise<MarketplaceSearchResult>;
	/** Download and install from marketplace */
	marketplaceInstall: (
		extensionId: string,
		downloadUrl: string,
	) => Promise<{ success: boolean; error?: string }>;
	/** Submit extension for review */
	marketplaceSubmit: (extensionId: string) => Promise<{ success: boolean; error?: string }>;
	/** Fetch pending reviews (admin) */
	fetchReviews: (params: {
		status?: MarketplaceReviewStatus;
		page?: number;
		pageSize?: number;
	}) => Promise<{ reviews: ExtensionReview[]; total: number }>;
	/** Update review status (admin) */
	updateReview: (
		reviewId: string,
		status: MarketplaceReviewStatus,
		notes?: string,
	) => Promise<{ success: boolean }>;
}

export function useExtensions(): UseExtensionsResult {
	const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
	const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
	const [ready, setReady] = useState(false);
	const activatingRef = useRef(new Set<string>());

	const discoverAndSync = useCallback(async (): Promise<ExtensionInfo[]> => {
		let discovered: ExtensionInfo[] = [];

		try {
			if (!electronAPI?.extensionsDiscover) {
				setExtensions([]);
				return [];
			}

			discovered = await electronAPI.extensionsDiscover();
			setExtensions(discovered);
			await extensionHost.syncConfiguredExtensions(discovered);

			return discovered;
		} catch (error) {
			console.error("[extensions] Failed to discover extensions:", error);
			return discovered;
		} finally {
			setReady(true);
		}
	}, []);

	const refresh = useCallback(async () => {
		await discoverAndSync();
	}, [discoverAndSync]);

	// Auto-discover on mount and restore extensions marked active.
	useEffect(() => {
		void discoverAndSync();
	}, [discoverAndSync]);

	// Sync activeIds with extension host (immediate + future changes)
	useEffect(() => {
		const sync = () => {
			const active = extensionHost.getActiveExtensions();
			setActiveIds(new Set(active.map((e) => e.manifest.id)));
		};
		// Immediately sync with any already-active extensions
		sync();
		return extensionHost.onChange(sync);
	}, []);

	const toggleExtension = useCallback(
		async (id: string) => {
			if (activatingRef.current.has(id)) return;
			activatingRef.current.add(id);

			try {
				if (activeIds.has(id)) {
					await extensionHost.deactivateExtension(id);
					await electronAPI?.extensionsDisable(id);
					setExtensions((prev) =>
						prev.map((ext) =>
							ext.manifest.id === id ? { ...ext, status: "disabled" } : ext,
						),
					);
				} else {
					const ext = extensions.find((e) => e.manifest.id === id);
					if (!ext) return;

					try {
						await electronAPI?.extensionsEnable(id);

						const moduleUrl = createExtensionModuleUrl(ext.path, ext.manifest.main);
						await extensionHost.activateExtension(ext, moduleUrl);
						setExtensions((prev) =>
							prev.map((candidate) =>
								candidate.manifest.id === id
									? { ...candidate, status: "active" }
									: candidate,
							),
						);
					} catch (err) {
						await electronAPI?.extensionsDisable(id);
						setExtensions((prev) =>
							prev.map((candidate) =>
								candidate.manifest.id === id
									? { ...candidate, status: "disabled" }
									: candidate,
							),
						);
						throw err;
					}
				}
			} catch (err) {
				console.error(`[extensions] Failed to toggle ${id}:`, err);
			} finally {
				activatingRef.current.delete(id);
			}
		},
		[activeIds, extensions],
	);

	const installFromFolder = useCallback(async (): Promise<boolean> => {
		if (!electronAPI?.extensionsInstallFromFolder) return false;
		const result = await electronAPI.extensionsInstallFromFolder();
		if (result?.success) {
			const extensionId = result.extension?.manifest?.id;
			if (typeof extensionId === "string") {
				await electronAPI?.extensionsEnable(extensionId);
			}
			await discoverAndSync();
			return true;
		}
		return false;
	}, [discoverAndSync]);

	const uninstall = useCallback(
		async (id: string): Promise<boolean> => {
			// Always deactivate — avoids stale closure over activeIds
			await extensionHost.deactivateExtension(id);
			if (!electronAPI?.extensionsUninstall) return false;
			const result = await electronAPI.extensionsUninstall(id);
			if (result?.success) {
				await discoverAndSync();
				return true;
			}
			return false;
		},
		[discoverAndSync],
	);

	const openDirectory = useCallback(async () => {
		await electronAPI?.extensionsOpenDirectory();
	}, []);

	const marketplaceSearch = useCallback(
		async (params: {
			query?: string;
			tags?: string[];
			sort?: "popular" | "recent" | "rating";
			page?: number;
			pageSize?: number;
		}): Promise<MarketplaceSearchResult> => {
			if (!electronAPI?.extensionsMarketplaceSearch) {
				return { extensions: [], total: 0, page: 1, pageSize: 20 };
			}

			const result = (await electronAPI.extensionsMarketplaceSearch(
				params,
			)) as MarketplaceSearchResult & {
				error?: string;
			};

			if (result?.error) {
				throw new Error(result.error);
			}

			return result;
		},
		[],
	);

	const marketplaceInstall = useCallback(
		async (extensionId: string, downloadUrl: string) => {
			if (!electronAPI?.extensionsMarketplaceInstall) {
				return { success: false, error: "Not available" };
			}
			const result = await electronAPI.extensionsMarketplaceInstall(extensionId, downloadUrl);
			if (result.success) {
				await electronAPI?.extensionsEnable(extensionId);
				await discoverAndSync();
			}
			return result;
		},
		[discoverAndSync],
	);

	const marketplaceSubmit = useCallback(async (extensionId: string) => {
		if (!electronAPI?.extensionsMarketplaceSubmit) {
			return { success: false, error: "Not available" };
		}
		return electronAPI.extensionsMarketplaceSubmit(extensionId);
	}, []);

	const fetchReviews = useCallback(
		async (params: { status?: MarketplaceReviewStatus; page?: number; pageSize?: number }) => {
			if (!electronAPI?.extensionsReviewsList) {
				return { reviews: [] as ExtensionReview[], total: 0 };
			}

			const result = (await electronAPI.extensionsReviewsList(params)) as {
				reviews: ExtensionReview[];
				total: number;
				error?: string;
			};

			if (result?.error) {
				throw new Error(result.error);
			}

			return result;
		},
		[],
	);

	const updateReview = useCallback(
		async (reviewId: string, status: MarketplaceReviewStatus, notes?: string) => {
			if (!electronAPI?.extensionsReviewUpdate) {
				return { success: false };
			}
			return electronAPI.extensionsReviewUpdate(reviewId, status, notes);
		},
		[],
	);

	return {
		extensions,
		activeIds,
		ready,
		refresh,
		toggleExtension,
		installFromFolder,
		uninstall,
		openDirectory,
		marketplaceSearch,
		marketplaceInstall,
		marketplaceSubmit,
		fetchReviews,
		updateReview,
	};
}
