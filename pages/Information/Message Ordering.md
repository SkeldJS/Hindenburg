Hindenburg has support for _message ordering_. Message ordering refers to making sure that packets received by Hindenburg are processed in the correct order. This shouldn't be especially important for most people, as the official servers also don't process messages in a particular order.

Mod developers, however, may find it useful to enable as it removes the need for using _sequence IDs_ for particular packets.

It also just adds another layer of reliability on top of DTLS, which is fundamentally an unreliable communication protocol.
