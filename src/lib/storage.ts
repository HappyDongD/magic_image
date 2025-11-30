import { ApiConfig, GeneratedImage, CustomModel } from "@/types"

const DB_NAME = 'magic-image-db'
const DB_VERSION = 1
const STORE_KEYS = {
  API_CONFIG: 'apiConfig',
  HISTORY: 'history',
  CUSTOM_MODELS: 'customModels'
}

const SINGLETON_KEYS = {
  API_CONFIG: 'api-config',
  HISTORY: 'history',
  CUSTOM_MODELS: 'custom-models'
}

const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'

let dbPromise: Promise<IDBDatabase> | null = null

const openDB = async (): Promise<IDBDatabase | null> => {
  if (!isBrowser) return null
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_KEYS.API_CONFIG)) {
        db.createObjectStore(STORE_KEYS.API_CONFIG)
      }
      if (!db.objectStoreNames.contains(STORE_KEYS.HISTORY)) {
        db.createObjectStore(STORE_KEYS.HISTORY)
      }
      if (!db.objectStoreNames.contains(STORE_KEYS.CUSTOM_MODELS)) {
        db.createObjectStore(STORE_KEYS.CUSTOM_MODELS)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })

  try {
    return await dbPromise
  } catch (error) {
    console.error('Failed to open IndexedDB', error)
    dbPromise = null
    return null
  }
}

const readValue = async <T>(storeName: string, key: string, fallback: T): Promise<T> => {
  const db = await openDB()
  if (!db) return fallback

  return new Promise<T>((resolve) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.get(key)

    request.onsuccess = () => {
      resolve((request.result as T) ?? fallback)
    }
    request.onerror = () => resolve(fallback)
  })
}

const writeValue = async <T>(storeName: string, key: string, value: T): Promise<void> => {
  const db = await openDB()
  if (!db) return

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    store.put(value, key)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Failed to write to IndexedDB'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })
}

const deleteValue = async (storeName: string, key: string): Promise<void> => {
  const db = await openDB()
  if (!db) return

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    store.delete(key)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Failed to delete from IndexedDB'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })
}

export const storage = {
  // API ������ز���
  getApiConfig: async (): Promise<ApiConfig | null> => {
    return readValue<ApiConfig | null>(STORE_KEYS.API_CONFIG, SINGLETON_KEYS.API_CONFIG, null)
  },

  setApiConfig: async (key: string, baseUrl: string): Promise<void> => {
    const apiConfig: ApiConfig = {
      key,
      baseUrl,
      createdAt: new Date().toISOString()
    }
    await writeValue(STORE_KEYS.API_CONFIG, SINGLETON_KEYS.API_CONFIG, apiConfig)
  },

  removeApiConfig: async (): Promise<void> => {
    await deleteValue(STORE_KEYS.API_CONFIG, SINGLETON_KEYS.API_CONFIG)
  },

  // ��ʷ��¼��ز���
  getHistory: async (): Promise<GeneratedImage[]> => {
    return readValue<GeneratedImage[]>(STORE_KEYS.HISTORY, SINGLETON_KEYS.HISTORY, [])
  },

  addToHistory: async (image: GeneratedImage): Promise<void> => {
    const history = await storage.getHistory()
    history.unshift(image)
    await writeValue(STORE_KEYS.HISTORY, SINGLETON_KEYS.HISTORY, history)
  },

  clearHistory: async (): Promise<void> => {
    await deleteValue(STORE_KEYS.HISTORY, SINGLETON_KEYS.HISTORY)
  },

  removeFromHistory: async (id: string): Promise<void> => {
    const history = await storage.getHistory()
    const filtered = history.filter(img => img.id !== id)
    await writeValue(STORE_KEYS.HISTORY, SINGLETON_KEYS.HISTORY, filtered)
  },

  // �Զ���ģ����ز���
  getCustomModels: async (): Promise<CustomModel[]> => {
    return readValue<CustomModel[]>(STORE_KEYS.CUSTOM_MODELS, SINGLETON_KEYS.CUSTOM_MODELS, [])
  },

  addCustomModel: async (model: CustomModel): Promise<void> => {
    const models = await storage.getCustomModels()
    models.push(model)
    await writeValue(STORE_KEYS.CUSTOM_MODELS, SINGLETON_KEYS.CUSTOM_MODELS, models)
  },

  removeCustomModel: async (id: string): Promise<void> => {
    const models = await storage.getCustomModels()
    const filtered = models.filter(model => model.id !== id)
    await writeValue(STORE_KEYS.CUSTOM_MODELS, SINGLETON_KEYS.CUSTOM_MODELS, filtered)
  },

  updateCustomModel: async (id: string, updated: Partial<CustomModel>): Promise<void> => {
    const models = await storage.getCustomModels()
    const index = models.findIndex(model => model.id === id)
    if (index !== -1) {
      models[index] = { ...models[index], ...updated }
      await writeValue(STORE_KEYS.CUSTOM_MODELS, SINGLETON_KEYS.CUSTOM_MODELS, models)
    }
  }
}
