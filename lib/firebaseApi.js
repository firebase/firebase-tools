const api = require("./api");

const API_VERSION = "v1beta1";

function _list(nextPageToken, projects) {
  projects = projects || [];

  let path = `/${API_VERSION}/projects?page_size=100`;
  if (nextPageToken) {
    path += `&page_token=${nextPageToken}`;
  }

  return api
    .request("GET", path, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then(response => {
      projects = projects.concat(response.body.results);
      if (response.body.nextPageToken) {
        return _list(response.body.nextPageToken, projects);
      }
      return projects;
    });
}

exports.listProjects = () => _list();

exports.getProject = projectId =>
  api
    .request("GET", `/${API_VERSION}/projects/${projectId}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then(response => response.body);
