const http = require('http');
const port = process.env.PORT || 8080;

const requestHandler = (request, response) => {
  console.log(request.url);
  var responseString = "Hello World, I'm Node.js!";

  response.end(responseString);
}

const server = http.createServer(requestHandler);

server.listen(port, (err) => {
  if (err) {
    return console.log(err);
  }

  console.log(`server is listening on ${port}`);
})
