
## Very simple HTTP server with password protection 

This is very old code (from 2013) that serves some files via HTTP with simple password protection.

I've recently modernized it by switching to newer node (some of ES6 features) and docker. It still 'Hello World' level. 

- Logs file downloads 
- Logs invalid logins 
- Plain password authorization using HTML form 

Known issues: 

- No HTTP range requests 
- No HTTP HEAD request 

Additionally (in real life) this thing is protected by HTTPS using nginx (not included)
