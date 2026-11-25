def pytest_configure(config):
    config.addinivalue_line("markers", "defaults: keep the starter policies in the policy tests")
