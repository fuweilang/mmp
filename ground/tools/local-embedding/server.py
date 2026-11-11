"""Loopback-only OpenAI Embeddings endpoint backed by a real local Chinese model."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import secrets
from threading import Lock
from typing import Protocol

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

MODEL_NAME = 'BAAI/bge-small-zh-v1.5'
MAX_REQUEST_BYTES = 4 * 1024 * 1024


class Encoder(Protocol):
    model_name: str
    dimension: int
    max_tokens: int

    def encode(self, texts: list[str]) -> tuple[list[list[float]], int]: ...


class LocalEncoder:
    """Reject overlong text before inference rather than silently truncating source content."""
    model_name = MODEL_NAME
    dimension = 512
    max_tokens = 512

    def __init__(self, cache_dir: Path, threads: int, local_files_only: bool):
        from fastembed import TextEmbedding
        from tokenizers import Tokenizer
        self.model = TextEmbedding(model_name=self.model_name, cache_dir=str(cache_dir), threads=threads,
                                   providers=['CPUExecutionProvider'], local_files_only=local_files_only)
        self.tokenizer = Tokenizer.from_str(self.model.model.tokenizer.to_str())
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()
        self.lock = Lock()

    def encode(self, texts: list[str]) -> tuple[list[list[float]], int]:
        with self.lock:
            counts = [len(item.ids) for item in self.tokenizer.encode_batch(texts)]
            if any(count > self.max_tokens for count in counts):
                raise ValueError('INPUT_TOKEN_LIMIT')
            vectors = [vector.tolist() for vector in self.model.embed(texts, batch_size=16)]
            if len(vectors) != len(texts) or any(len(vector) != self.dimension or not any(vector)
                or any(not math.isfinite(value) for value in vector) for vector in vectors):
                raise RuntimeError('MODEL_INVALID_OUTPUT')
            return vectors, sum(counts)


def create_app(encoder: Encoder, api_key: str) -> FastAPI:
    if not api_key:
        raise ValueError('API key is required')
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    def error(code: str, status: int = 400):
        return JSONResponse({'error': {'code': code, 'message': code}}, status_code=status)

    @app.get('/healthz')
    def health():
        return {'ready': True, 'model': encoder.model_name, 'dimension': encoder.dimension, 'maxInputTokens': encoder.max_tokens}

    @app.post('/v1/embeddings')
    async def embeddings(request: Request):
        if not secrets.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + api_key):
            return error('UNAUTHORIZED', 401)
        declared = request.headers.get('content-length')
        if declared and declared.isdecimal() and int(declared) > MAX_REQUEST_BYTES:
            return error('INPUT_BYTE_LIMIT', 413)
        raw = bytearray()
        async for part in request.stream():
            if len(raw) + len(part) > MAX_REQUEST_BYTES:
                return error('INPUT_BYTE_LIMIT', 413)
            raw.extend(part)
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            return error('INVALID_REQUEST')
        if not isinstance(body, dict):
            return error('INVALID_REQUEST')
        if body.get('model') != encoder.model_name:
            return error('MODEL_NOT_CONFIGURED')
        if body.get('dimensions', encoder.dimension) != encoder.dimension:
            return error('DIMENSION_MISMATCH')
        if body.get('encoding_format', 'float') != 'float':
            return error('UNSUPPORTED_ENCODING')
        texts = body.get('input')
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, list) or not 1 <= len(texts) <= 128 or any(not isinstance(text, str) or not text.strip() for text in texts):
            return error('INVALID_INPUT')
        try:
            vectors, tokens = await run_in_threadpool(encoder.encode, texts)
        except ValueError as exc:
            return error('INPUT_TOKEN_LIMIT' if str(exc) == 'INPUT_TOKEN_LIMIT' else 'INVALID_INPUT')
        except Exception:
            return error('MODEL_INFERENCE_FAILED', 500)
        return {'object': 'list', 'model': encoder.model_name,
                'data': [{'object': 'embedding', 'index': index, 'embedding': vector} for index, vector in enumerate(vectors)],
                'usage': {'prompt_tokens': tokens, 'total_tokens': tokens}}

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--port', type=int, default=62565)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--local-files-only', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.threads <= 32:
        parser.error('port or threads out of range')
    key = args.key_file.read_text(encoding='utf-8').strip()
    encoder = LocalEncoder(args.cache_dir, args.threads, args.local_files_only)
    import uvicorn
    uvicorn.run(create_app(encoder, key), host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
