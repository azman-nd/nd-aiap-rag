# LightRAG Query Routes Unit Tests

This directory contains unit tests for the LightRAG query routes and QueryParam functionality.

## Test Coverage

The test suite covers the following scenarios:

1. **Query Endpoint Deprecation**: Verifies that the old `/query` endpoint is no longer available and the new `/query_nofilter` endpoint is used instead.

2. **Query Nofilter Endpoint**: Tests that `/query_nofilter` endpoint returns unfiltered chunks, entities, and relationships from `rag.aquery`.

3. **QueryParam Document IDs**: Validates that `QueryParam` can correctly store and retrieve a list of document IDs.

4. **Query Data Chunk Filtering**: Ensures the `/query/data` endpoint correctly filters chunks based on accessible documents.

5. **Query Data Entity/Relationship Filtering**: Tests that the `/query/data` endpoint correctly filters entities and relationships based on accessible documents.

## Prerequisites

Install the required testing dependencies:

```bash
pip install pytest pytest-asyncio httpx
```

Or if using the `[api]` extras:

```bash
pip install -e ".[api]"
pip install pytest pytest-asyncio
```

## Running the Tests

### Run all tests in the file:

```bash
pytest tests/test_query_routes.py -v
```

### Run a specific test class:

```bash
pytest tests/test_query_routes.py::TestQueryEndpointDeprecation -v
```

### Run a specific test:

```bash
pytest tests/test_query_routes.py::TestQueryEndpointDeprecation::test_query_endpoint_not_available -v
```

### Run with coverage:

```bash
pytest tests/test_query_routes.py --cov=lightrag.api.routers.query_routes --cov-report=html
```

## Test Structure

The tests are organized into the following classes:

- `TestQueryEndpointDeprecation`: Tests for endpoint availability
- `TestQueryNofilterEndpoint`: Tests for `/query_nofilter` endpoint behavior
- `TestQueryParamDocumentIds`: Tests for QueryParam document ID handling
- `TestQueryDataEndpointChunkFiltering`: Tests for chunk filtering in `/query/data`
- `TestQueryDataEndpointEntityRelationshipFiltering`: Tests for entity/relationship filtering
- `TestQueryDataEndpointAccessControl`: Additional access control integration tests

## Test Fixtures

The test suite uses the following fixtures:

- `mock_rag`: Mock RAG instance with async methods
- `app_with_routes`: FastAPI app with query routes
- `client`: TestClient for making HTTP requests
- `sample_doc_status`: Sample document status objects for testing

## Mocking Strategy

The tests use `unittest.mock` to:
- Mock the RAG instance and its methods (`aquery`, `aquery_data`)
- Mock authentication and access control functions
- Mock document status storage
- Simulate various user access scenarios

## Notes

- All tests use async mocks (`AsyncMock`) for async functions
- Tests verify both successful and error scenarios
- Access control logic is extensively tested with various permission combinations
- Multi-document entities (with `GRAPH_FIELD_SEP`) are tested separately
