-- Create separate databases for each microservice
CREATE DATABASE auth_service;
CREATE DATABASE product_service;
CREATE DATABASE order_service;
CREATE DATABASE payment_service;
CREATE DATABASE notification_service;
CREATE DATABASE recommendation_service;
CREATE DATABASE analytics_service;
CREATE DATABASE cart_service;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE auth_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE product_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE order_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE payment_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE notification_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE recommendation_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE analytics_service TO commercesphere;
GRANT ALL PRIVILEGES ON DATABASE cart_service TO commercesphere;
