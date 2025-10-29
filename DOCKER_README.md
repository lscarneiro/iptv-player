# IPTV Player - Docker Setup

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# Access the app at http://localhost:8080
```

To stop:
```bash
docker-compose down
```

### Using Docker Directly

```bash
# Build the image
docker build -t iptv-player .

# Run the container
docker run -d -p 8080:80 --name iptv-player iptv-player

# Access the app at http://localhost:8080
```

To stop and remove:
```bash
docker stop iptv-player
docker rm iptv-player
```

## Custom Port

To use a different port, edit `docker-compose.yml`:

```yaml
ports:
  - "3000:80"  # Change 3000 to your desired port
```

Or when using docker run:
```bash
docker run -d -p 3000:80 iptv-player
```

## Minimal Dockerfile

The Dockerfile is extremely minimal:
- Uses `nginx:alpine` (only ~5MB base image)
- Copies application files to nginx web root
- Exposes port 80
- Total image size: ~15-20MB

## File Structure in Container

```
/usr/share/nginx/html/
├── index.html        # Main entry point
├── index.css         # Styles
├── js/               # JavaScript modules
│   ├── app.js
│   ├── services/
│   ├── components/
│   └── utils/
└── ...
```

## Accessing the App

Simply navigate to:
- http://localhost:8080 (or your configured port)

No need to specify any routes - the app loads directly!

## Production Use

For production, you may want to add:
- Custom nginx configuration
- SSL/HTTPS certificates
- Environment variables
- Health checks

## Troubleshooting

### Container won't start
```bash
docker logs iptv-player
```

### Check if container is running
```bash
docker ps
```

### Access container shell
```bash
docker exec -it iptv-player sh
```

