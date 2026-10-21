// Pages changes only the public TLS hostname. Rooms and protocol validation
// remain in the existing Worker; no second room registry or business relay.
export default {
  fetch(request, env) {
    return env.SIGNAL_SERVICE.fetch(request)
  },
}
