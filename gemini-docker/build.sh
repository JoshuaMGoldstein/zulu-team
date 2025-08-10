echo "$GITHUB_PAT" > /tmp/github_token
docker build --no-cache --secret id=github_token,src=/tmp/github_token -t gemini-docker .
rm /tmp/github_token