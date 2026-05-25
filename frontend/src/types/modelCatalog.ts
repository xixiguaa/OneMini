import type { ModelCapability, ModelProvider } from './agent'

export type ModelCatalogTagVariant = 'beta' | 'preview' | 'featured' | 'info'

export interface ModelCatalogTag {
  text: string
  variant?: ModelCatalogTagVariant
}

export interface ModelCatalogItem {
  id: string
  model: string
  label: string
  description?: string
  baseUrl?: string
  tags?: ModelCatalogTag[]
}

export interface ModelCatalogCategory {
  id: string
  label: string
  models: ModelCatalogItem[]
}

export interface ModelCatalogResponse {
  provider: ModelProvider | string
  capability: ModelCapability | string
  source: 'catalog' | 'fallback'
  categories: ModelCatalogCategory[]
}

/** 选择器对外暴露的扁平选项（兼容 ProviderModelOption） */
export interface PickerModelOption {
  id: string
  model: string
  label: string
  description?: string
  baseUrl?: string
  tags?: ModelCatalogTag[]
  categoryId?: string
  categoryLabel?: string
}
