FROM ubuntu:22.04

WORKDIR /app

# Install gcsfuse dependencies and gcsfuse itself
RUN apt-get update && apt-get install -y curl lsb-release gnupg fuse && \
    export GCSFUSE_REPO=gcsfuse-$(lsb_release -c -s) && \
    echo "deb http://packages.cloud.google.com/apt $GCSFUSE_REPO main" | tee /etc/apt/sources.list.d/gcsfuse.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
    apt-get update && \
    apt-get install -y gcsfuse

# Create a non-root user
RUN useradd -m -u 1000 -s /bin/bash appuser

# Copy the entrypoint script
COPY container_entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/container_entrypoint.sh

# Set the entrypoint to our custom script
ENTRYPOINT ["/usr/local/bin/container_entrypoint.sh"]

# Default command for the appuser (e.g., starting the Gemini CLI)
CMD ["bash"]

