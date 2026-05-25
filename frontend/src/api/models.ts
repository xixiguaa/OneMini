import axios from 'axios'
import {
  getModelOptions,
  type ProviderModelOption,
} from '../config/providerModels'
import type {
  ModelCatalogCategory,
  ModelCatalogResponse,
  PickerModelOption,
} from '../types/modelCatalog'
import type { ModelCapability, ModelProvider } from '../types/agent'

const api = axios.create({ baseURL: '/api', timeout: 30000 })

export async function fetchModelCatalog(
  provider: ModelProvider,
  capability: ModelCapability,
): Promise<ModelCatalogResponse> {
  const { data } = await api.get<ModelCatalogResponse>('/models/catalog', {
    params: { provider, capability },
  })
  return data
}

function optionFromCatalogItem(
  item: ModelCatalogCategory['models'][number],
  category: ModelCatalogCategory,
): PickerModelOption {
  return {
    id: item.id,
    model: item.model,
    label: item.label,
    description: item.description,
    baseUrl: item.baseUrl,
    tags: item.tags,
    categoryId: category.id,
    categoryLabel: category.label,
  }
}

/** 过滤静态列表中的「手动填写」占位项 */
function isRealModelOption(o: ProviderModelOption): boolean {
  return Boolean(o.model?.trim())
}

function fallbackFromStatic(
  provider: ModelProvider,
  capability: ModelCapability,
): ModelCatalogResponse {
  const opts = getModelOptions(provider, capability).filter(isRealModelOption)
  if (!opts.length) {
    return { provider, capability, source: 'fallback', categories: [] }
  }
  const models = opts.map((o) => ({
    id: o.model,
    model: o.model,
    label: o.label,
    description: o.description,
    baseUrl: o.baseUrl,
  }))
  return {
    provider,
    capability,
    source: 'fallback',
    categories: [{ id: 'default', label: '推荐模型', models }],
  }
}

function normalizeCatalog(catalog: ModelCatalogResponse): ModelCatalogResponse {
  const categories = catalog.categories
    .map((cat) => ({
      ...cat,
      models: cat.models.filter((m) => m.model?.trim()),
    }))
    .filter((cat) => cat.models.length > 0)
  return { ...catalog, categories }
}

export function catalogToPickerOptions(
  catalog: ModelCatalogResponse,
): PickerModelOption[] {
  const out: PickerModelOption[] = []
  for (const cat of catalog.categories) {
    for (const m of cat.models) {
      out.push(optionFromCatalogItem(m, cat))
    }
  }
  return out
}

/** 拉取目录；失败时回退到前端静态 providerModels */
export async function loadModelPickerOptions(
  provider: ModelProvider,
  capability: ModelCapability,
): Promise<{ catalog: ModelCatalogResponse; options: PickerModelOption[] }> {
  try {
    const catalog = await fetchModelCatalog(provider, capability)
    const normalized = normalizeCatalog(catalog)
    if (normalized.categories.some((c) => c.models.length > 0)) {
      return { catalog: normalized, options: catalogToPickerOptions(normalized) }
    }
  } catch {
    /* 使用静态兜底 */
  }
  const catalog = fallbackFromStatic(provider, capability)
  return { catalog, options: catalogToPickerOptions(catalog) }
}

export function pickerOptionToProviderOption(opt: PickerModelOption): ProviderModelOption {
  return {
    model: opt.model,
    label: opt.label,
    baseUrl: opt.baseUrl,
    description: opt.description,
  }
}
