#Imagen
FROM node:22-alpine 
#Directorio de trabajo del proyecto
WORKDIR /app
#Copiar package/package-lock
COPY package*.json ./
#npm install pero desde el package lock (dependencias más fijas)
RUN npm ci
#Copiar todo el proyecto
COPY . .
#Exponer puerto
EXPOSE 8080
#Comando para ejecutar la aplicación
CMD ["npm","run","start"] 