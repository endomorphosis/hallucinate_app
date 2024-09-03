#FROM nvidia/cuda:11.7.1-base-ubuntu22.04
FROM nvidia/cuda:12.1.0-base-ubuntu22.04    

RUN apt-get update && \
    apt-get install -y python3 python3-pip git aria2 python3-boto3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* 


WORKDIR /root

RUN python3 -m pip install torch torchvision
RUN FORCE_CMAKE=1 CMAKE_ARGS="-DLLAMA_CUBLAS=on -DLLAMA_AVX2=off -DLLAMA_FMA=off" python3 -m pip install llama-cpp-python

COPY ./config config
COPY ./install install
COPY ./hallucinate_app hallucinate_app
COPY ./index.js index.js
COPY ./worker.py worker.py
COPY ./worker.js worker.js
COPY ./LICENSE LICENSE
COPY ./package.json package.json
COPY ./package-lock.json package-lock.json
COPY ./README.md README.md
COPY ./forge.config.cjs forge.config.cjs

RUN python3 -m pip install -r ./hallucinate_app/python/requirements.txt


ENTRYPOINT ["node", "index.js"]