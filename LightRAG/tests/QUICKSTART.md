# Quick Start Guide - Running Tests

This guide will help you quickly set up and run the LightRAG query route tests.

## 1. Install Dependencies

### Option A: Install test dependencies only
```bash
pip install -r tests/requirements-test.txt
```

### Option B: Install LightRAG with API extras (includes test dependencies)
```bash
cd /Users/azmansami/Developer/rag/nd-aiap-rag/LightRAG
pip install -e ".[api]"
pip install pytest pytest-asyncio pytest-cov
```

## 2. Verify Installation

Check that pytest is installed:
```bash
pytest --version
```

You should see output like: `pytest 7.4.0` or similar.

## 3. Run the Tests

### Run all tests with verbose output:
```bash
pytest tests/test_query_routes.py -v
```

### Expected output:
```
tests/test_query_routes.py::TestQueryEndpointDeprecation::test_query_endpoint_not_available PASSED
tests/test_query_routes.py::TestQueryEndpointDeprecation::test_query_nofilter_endpoint_available PASSED
tests/test_query_routes.py::TestQueryNofilterEndpoint::test_query_nofilter_returns_aquery_response PASSED
tests/test_query_routes.py::TestQueryNofilterEndpoint::test_query_nofilter_returns_context_only PASSED
tests/test_query_routes.py::TestQueryParamDocumentIds::test_query_param_stores_document_ids PASSED
tests/test_query_routes.py::TestQueryParamDocumentIds::test_query_param_empty_ids_list PASSED
tests/test_query_routes.py::TestQueryParamDocumentIds::test_query_param_none_ids PASSED
tests/test_query_routes.py::TestQueryParamDocumentIds::test_query_request_to_query_params_preserves_ids PASSED
tests/test_query_routes.py::TestQueryDataEndpointChunkFiltering::test_query_data_filters_chunks_by_accessible_docs PASSED
tests/test_query_routes.py::TestQueryDataEndpointEntityRelationshipFiltering::test_query_data_filters_entities_and_relationships PASSED
tests/test_query_routes.py::TestQueryDataEndpointEntityRelationshipFiltering::test_query_data_handles_multi_document_entities PASSED
tests/test_query_routes.py::TestQueryDataEndpointAccessControl::test_query_data_no_accessible_documents PASSED
tests/test_query_routes.py::TestQueryDataEndpointAccessControl::test_query_data_includes_metadata PASSED

======================== 13 passed in 2.35s ========================
```

## 4. Run Specific Test Cases

### Test Case 1: Query endpoint deprecation
```bash
pytest tests/test_query_routes.py::TestQueryEndpointDeprecation -v
```

### Test Case 2: Query nofilter endpoint
```bash
pytest tests/test_query_routes.py::TestQueryNofilterEndpoint -v
```

### Test Case 3: QueryParam document IDs
```bash
pytest tests/test_query_routes.py::TestQueryParamDocumentIds -v
```

### Test Case 4: Chunk filtering
```bash
pytest tests/test_query_routes.py::TestQueryDataEndpointChunkFiltering -v
```

### Test Case 5: Entity/Relationship filtering
```bash
pytest tests/test_query_routes.py::TestQueryDataEndpointEntityRelationshipFiltering -v
```

## 5. Generate Coverage Report

Run tests with coverage analysis:
```bash
pytest tests/test_query_routes.py --cov=lightrag.api.routers.query_routes --cov-report=html --cov-report=term
```

View the HTML coverage report:
```bash
open htmlcov/index.html  # macOS
# or
xdg-open htmlcov/index.html  # Linux
# or
start htmlcov/index.html  # Windows
```

## 6. Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'pytest'"
**Solution**: Install pytest:
```bash
pip install pytest pytest-asyncio
```

### Issue: "ModuleNotFoundError: No module named 'lightrag'"
**Solution**: Install LightRAG:
```bash
cd /Users/azmansami/Developer/rag/nd-aiap-rag/LightRAG
pip install -e .
```

### Issue: "ModuleNotFoundError: No module named 'fastapi'"
**Solution**: Install FastAPI:
```bash
pip install fastapi httpx
```

### Issue: Tests fail with import errors
**Solution**: Make sure you're in the LightRAG root directory:
```bash
cd /Users/azmansami/Developer/rag/nd-aiap-rag/LightRAG
pytest tests/test_query_routes.py -v
```

## 7. Understanding Test Results

### ✅ PASSED
The test passed successfully. The code behaves as expected.

### ❌ FAILED
The test failed. Check the error message and traceback to understand what went wrong.

### ⚠️ SKIPPED
The test was skipped (not applicable here, but good to know).

### Example failure output:
```
FAILED tests/test_query_routes.py::TestQueryDataEndpointChunkFiltering::test_query_data_filters_chunks_by_accessible_docs

AssertionError: assert 3 == 2
Expected only 2 chunks (from doc1 and doc3)
Got 3 chunks (includes inaccessible doc2)
```

## 8. Next Steps

After verifying tests pass:

1. **Review test coverage**: Check which code paths are tested
2. **Add more tests**: Extend coverage for edge cases
3. **Run tests regularly**: Before committing changes
4. **Integrate with CI/CD**: Add to your continuous integration pipeline

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pytest tests/test_query_routes.py -v` | Run all tests with verbose output |
| `pytest tests/test_query_routes.py -vv` | Run with extra verbose output |
| `pytest tests/test_query_routes.py -k "query_param"` | Run tests matching pattern |
| `pytest tests/test_query_routes.py --lf` | Run last failed tests |
| `pytest tests/test_query_routes.py --sw` | Stop on first failure |
| `pytest tests/test_query_routes.py -x` | Exit on first failure |

## Support

For more information:
- See `tests/README.md` for detailed documentation
- See `tests/TEST_SUMMARY.md` for comprehensive test overview
- Check pytest documentation: https://docs.pytest.org/
