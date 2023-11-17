from flask import Flask

app = Flask(__name__, static_url_path="/asdflkjlerifj", static_folder='ijoeirjf')

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"
