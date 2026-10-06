SELECT 'CREATE DATABASE streamtube_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streamtube_test')\gexec
