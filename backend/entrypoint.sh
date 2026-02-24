#!/bin/sh

CERT_DIR=/etc/ssl/certs

# Generate SSL certs so backend can serve HTTPS (matches frontend; browser will show self-signed warning once)
if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
	echo "Generating SSL certificate for backend..."
	mkdir -p "$CERT_DIR"
	openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
		-keyout "$CERT_DIR/key.pem" \
		-out "$CERT_DIR/cert.pem" \
		-subj "/C=FI/ST=Uusima/L=Helsinki/O=Hive Helsinki/CN=localhost"
else
	echo "Backend SSL cert already exists"
fi

npm run migration:reset
npm run build

# Continue to default CMD
exec "$@"