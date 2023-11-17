import importlib
import importlib.util
import inspect
import sys
import os

sys.path.insert(0, os.getcwd())
spec = importlib.util.spec_from_file_location("main", "main.py")
if spec is not None and spec.loader is not None:
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    functions = inspect.getmembers(module)
    for name, prop in functions:
        if not inspect.isclass(prop) and hasattr(prop, "wsgi_app"):
            print(name)
            print(prop.static_folder)
            print(prop.static_url_path)
