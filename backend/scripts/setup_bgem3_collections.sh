#!/usr/bin/env bash
# 一键：下载 BGE-M3 ONNX → 迁移 Milvus 集合 → 种子文档入库
# 在 backend 目录执行: bash scripts/setup_bgem3_collections.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d .venv ]]; then
  echo "请先创建虚拟环境: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> 1/3 检查/下载 BGE-M3 ONNX（含 model.onnx_data，约 2GB+）"
# 未设置时默认国内镜像；直连 huggingface.co 可用: export HF_ENDPOINT=https://huggingface.co
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
python scripts/download_bge_m3_onnx.py

echo "==> 2/3 迁移知识库 + 对话（旧集合 → *_bgem3，BGE-M3 重嵌）"
python scripts/migrate_knowledge_to_bgem3.py --with-chat --batch-size 8

echo "==> 3/3 种子文档入库"
python scripts/ingest_knowledge_dir.py data/knowledge_seed

echo ""
echo "完成。请确认 backend/.env："
echo "  MILVUS_COLLECTION=onemini_knowledge_bgem3"
echo "  MILVUS_CHAT_COLLECTION=onemini_chat_bgem3"
echo "  EMBEDDING_MODEL=BAAI/bge-m3"
echo "重启后端: python run.py"
