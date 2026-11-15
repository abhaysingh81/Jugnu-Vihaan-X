FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir Flask==3.1.3 requests==2.32.5 waitress==3.0.2
COPY agent.py /app/agent.py
CMD ["python", "agent.py"]
