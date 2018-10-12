const api = require("./api");

function _list(nextPageToken, projects) {
  projects = projects || [];

  let path = "/v1beta1/projects?page_size=100";
  if (nextPageToken) {
    path += `&page_token=${nextPageToken}`;
  }

  return api
    .request("GET", path, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then(response => {
      projects = projects.concat(projects, response.body.results);
      if (response.body.nextPageToken) {
        return _list(response.body.nextPageToken, projects);
      }
      return projects;
    });
}

exports.listProjects = () => _list();

exports.getProject = projectId =>
  api
    .request("GET", `/v1beta1/projects/${projectId}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then(response => response.body);
