echo "$GITHUB_PAT" > /tmp/github_token
echo "$EXEC_TOKEN" > /tmp/exec_token
docker build --secret id=github_token,src=/tmp/github_token --secret id=exec_token,src=/tmp/exec_token -t gemini-docker:latest .
docker build --secret id=github_token,src=/tmp/github_token  --secret id=exec_token,src=/tmp/exec_token -t us-east4-docker.pkg.dev/zulu-team/zulu-team/gemini-docker:latest .
rm /tmp/github_token
rm /tmp/exec_token
