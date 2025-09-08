echo "$EXEC_TOKEN" > /tmp/exec_token
docker build --no-cache --secret id=exec_token,src=/tmp/exec_token -t buildserver-docker:latest .
docker build --no-cache --secret id=exec_token,src=/tmp/exec_token -t us-east4-docker.pkg.dev/zulu-team/zulu-team/buildserver-docker:latest .
rm /tmp/exec_token


docker push us-east4-docker.pkg.dev/zulu-team/zulu-team/buildserver-docker:latest
gcloud run deploy zulu-buildserver-docker --image us-east4-docker.pkg.dev/zulu-team/zulu-team/buildserver-docker:latest \
  --region us-east4 --allow-unauthenticated --min-instances=0 --max-instances=8 --concurrency=1 \
  --platform managed \
  --execution-environment=gen2



gcloud run deploy zulu-omniparser-docker --image us-east4-docker.pkg.dev/zulu-team/zulu-team/omniparserv2:latest \
    --region us-east4 --allow-unauthenticated \
    --min-instances=0 --max-instances=1 --concurrency=8 \
    --platform managed --gpu 1 --gpu-type nvidia-l4 --no-cpu-throttling --no-gpu-zonal-redundancy \
    --port=7862