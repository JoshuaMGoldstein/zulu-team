FROM scratch

ARG SSH_KEY_PATH
ARG KEY_FILENAME
USER git
WORKDIR /home/git
RUN mkdir -p ~/.ssh
COPY ${SSH_KEY_PATH} ~/.ssh/${KEY_FILENAME}
RUN chmod 600 ~/.ssh/${KEY_FILENAME}
RUN touch ~/.ssh/config
RUN chmod 600 ~/.ssh/config
RUN echo "Host *" > ~/.ssh/config
RUN echo "  StrictHostKeyChecking no" >> ~/.ssh/config
RUN echo "  UserKnownHostsFile /dev/null" >> ~/.ssh/config