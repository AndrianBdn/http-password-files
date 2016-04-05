.PHONY: all image clean run 
 
all: image clean run

image:
	docker build -t local/http-password-files . 

clean: 
	docker stop http-password-files-9091 || true
	docker rm http-password-files-9091 || true

run:
	docker run --name=http-password-files-9091 --restart=always -d -p 9091:8080 -v $$(cd ../data && pwd):/data local/http-password-files 
