#Setup GCloud  and Docker Auth

#gcloud init
  #pick zulu-team
  #pick us-east-4

gcloud artifacts locations list
gcloud auth configure-docker us-east4-docker.pkg.dev
#less ~/.docker/config.json

gcloud artifacts repositories list --project=zulu-team --location=us-east4
gcloud artifacts repositories describe zulu-team --project=zulu-team --location=us-east4
gcloud artifacts repositories create zulu-team --repository-format=docker --description='Zulu Team' --project=zulu-team --location=us-east4


# Build nad Push
../build.sh
#docker build -t us-east4-docker.pkg.dev/zulu-team/zulu-team/gemini-docker:latest 
docker push us-east4-docker.pkg.dev/zulu-team/zulu-team/gemini-docker:latest
gcloud run deploy zulu-gemini-docker --image us-east4-docker.pkg.dev/zulu-team/zulu-team/gemini-docker:latest \
  --region us-east4 --allow-unauthenticated --min-instances=0 --max-instances=8 --concurrency=1 \
  --platform managed \
  --execution-environment=gen2

# Note that anthos supports on-preomise cloud which sounds way fucking cool to use cloud run on your own dedicated hardware.
# -- platform gke supports anthos kubernetes deployments.


#--port=8088 

#You can also configure additional settings during deployment
#such as port, environment variables, memory limits, and more, 
#using flags like --port, --set-env-vars, --memory, etc. Refer to the gcloud run deploy --help
