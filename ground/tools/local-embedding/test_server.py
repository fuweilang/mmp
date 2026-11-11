"""HTTP contracts; the live-model check is a separate acceptance probe."""
import unittest
from fastapi.testclient import TestClient
from server import create_app


class UnitEncoder:
    model_name = 'BAAI/bge-small-zh-v1.5'
    dimension = 512
    max_tokens = 512

    def __init__(self):
        self.calls = 0

    def encode(self, texts):
        self.calls += 1
        if any(len(text) > self.max_tokens for text in texts):
            raise ValueError('INPUT_TOKEN_LIMIT')
        return [[1.0] + [0.0] * 511 for _ in texts], sum(map(len, texts))


class ServiceContracts(unittest.TestCase):
    def setUp(self):
        self.encoder = UnitEncoder()
        self.client = TestClient(create_app(self.encoder, 'unit-test-only'))
        self.headers = {'Authorization': 'Bearer unit-test-only'}
        self.body = {'model': self.encoder.model_name, 'input': ['中文语义'], 'dimensions': 512, 'encoding_format': 'float'}

    def test_rejects_missing_credentials_before_inference(self):
        self.assertEqual(self.client.post('/v1/embeddings', json=self.body).status_code, 401)
        self.assertEqual(self.encoder.calls, 0)

    def test_embeddings_support_openai_batch_indices_and_usage(self):
        result = self.client.post('/v1/embeddings', headers=self.headers, json={**self.body, 'input': ['产品卖点', '消费心理']})
        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual([row['index'] for row in body['data']], [0, 1])
        self.assertTrue(all(len(row['embedding']) == 512 for row in body['data']))
        self.assertEqual(body['usage']['total_tokens'], 8)

    def test_rejects_wrong_model_and_dimension(self):
        for changed in [{'model': 'engineering-ui-embedding'}, {'dimensions': 2}, {'encoding_format': 'base64'}]:
            with self.subTest(changed=changed):
                self.assertEqual(self.client.post('/v1/embeddings', headers=self.headers, json={**self.body, **changed}).status_code, 400)
        self.assertEqual(self.encoder.calls, 0)

    def test_rejects_blank_and_non_text_inputs(self):
        for value in ['', [' '], [1], [], ['text'] * 129]:
            with self.subTest(value=type(value).__name__):
                self.assertEqual(self.client.post('/v1/embeddings', headers=self.headers, json={**self.body, 'input': value}).status_code, 400)
        self.assertEqual(self.encoder.calls, 0)

    def test_overlong_input_is_rejected_instead_of_truncated(self):
        result = self.client.post('/v1/embeddings', headers=self.headers, json={**self.body, 'input': ['长' * 513]})
        self.assertEqual(result.status_code, 400)
        self.assertEqual(result.json()['error']['code'], 'INPUT_TOKEN_LIMIT')

    def test_readiness_identifies_real_model_and_dimension(self):
        result = self.client.get('/healthz')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['model'], self.encoder.model_name)
        self.assertEqual(result.json()['dimension'], 512)

class StreamingBounds(unittest.IsolatedAsyncioTestCase):
    async def test_chunked_body_stops_reading_at_limit(self):
        encoder = UnitEncoder()
        app = create_app(encoder, 'unit-test-only')
        bodies = [b'x' * (2 * 1024 * 1024), b'x' * (2 * 1024 * 1024 + 1), b'not-read']
        reads, messages = [], []

        async def receive():
            index = len(reads)
            reads.append(index)
            return {'type': 'http.request', 'body': bodies[index], 'more_body': index < len(bodies) - 1}

        async def send(message):
            messages.append(message)

        await app({'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1', 'method': 'POST', 'scheme': 'http',
                   'path': '/v1/embeddings', 'raw_path': b'/v1/embeddings', 'query_string': b'',
                   'headers': [(b'authorization', b'Bearer unit-test-only')], 'server': ('127.0.0.1', 62565), 'client': ('127.0.0.1', 1)}, receive, send)
        self.assertEqual(next(message['status'] for message in messages if message['type'] == 'http.response.start'), 413)
        self.assertEqual(len(reads), 2)
        self.assertEqual(encoder.calls, 0)

    async def test_declared_oversize_is_refused_before_json_parsing(self):
        with TestClient(create_app(UnitEncoder(), 'unit-test-only')) as client:
            result = client.post('/v1/embeddings', headers={'Authorization': 'Bearer unit-test-only', 'Content-Length': '4194305'}, content=b'{}')
        self.assertEqual(result.status_code, 413)


if __name__ == '__main__':
    unittest.main()
