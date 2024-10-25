# Use a specific version of Node.js as a parent image
FROM node:14

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of your application code to the container
COPY . .

# Expose port 3000 for the app
EXPOSE 6001

# Command to run the worker
CMD ["node", "email-worker.js"]
