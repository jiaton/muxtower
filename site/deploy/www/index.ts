// www.muxtower.dev serves nothing: every request is a permanent redirect to the same path on the apex.
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url)
    return Response.redirect(`https://muxtower.dev${url.pathname}${url.search}`, 301)
  },
}
