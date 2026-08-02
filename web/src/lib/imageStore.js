// Guarda as imagens do quadro.
//
// Modo nuvem: sobe pro Storage do Supabase e devolve uma URL pública, que
// todo mundo enxerga. Modo local: guarda o arquivo no IndexedDB do próprio
// navegador (localStorage estouraria com duas ou três fotos) e devolve uma
// URL temporária de memória.

import { supabase, hasCloud } from './supabase'

const DB_NAME = 'takeatmap'
const STORE = 'images'

function openDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

async function idbPut(key, blob) {
	const db = await openDb()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite')
		tx.objectStore(STORE).put(blob, key)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

async function idbGet(key) {
	const db = await openDb()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly')
		const req = tx.objectStore(STORE).get(key)
		req.onsuccess = () => resolve(req.result || null)
		req.onerror = () => reject(req.error)
	})
}

const uid = () => crypto.randomUUID().slice(0, 12)

/** Sobe uma imagem e devolve a referência a guardar no quadro. */
export async function uploadImage(file) {
	if (hasCloud) {
		const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
		const path = `${uid()}.${ext}`
		const { error } = await supabase.storage.from('map-images').upload(path, file, {
			cacheControl: '31536000',
			upsert: false,
		})
		if (error) throw error
		const { data } = supabase.storage.from('map-images').getPublicUrl(path)
		return { ref: `cloud:${path}`, src: data.publicUrl }
	}
	const key = `local:${uid()}`
	await idbPut(key, file)
	return { ref: key, src: URL.createObjectURL(file) }
}

/** Converte a referência guardada no quadro numa URL que a tela consegue exibir. */
export async function resolveImage(ref) {
	if (!ref) return null
	if (ref.startsWith('http')) return ref
	if (ref.startsWith('cloud:')) {
		if (!hasCloud) return null
		const { data } = supabase.storage.from('map-images').getPublicUrl(ref.slice(6))
		return data.publicUrl
	}
	const blob = await idbGet(ref)
	return blob ? URL.createObjectURL(blob) : null
}
