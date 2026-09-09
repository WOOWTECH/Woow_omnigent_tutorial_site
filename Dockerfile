# 靜態站台 image — 只放實際要對外提供的檔案。
# 建置流程用的檔案（scripts/、chapters.json、README）一律不進 image，
# 避免內部資訊隨站台一起上線。另見 .dockerignore。
FROM nginx:alpine

WORKDIR /usr/share/nginx/html
RUN rm -rf ./*

# 內容頁（全部 .html）
COPY *.html ./

# 靜態資源與 SEO / 授權檔
COPY assets ./assets
COPY en ./en
COPY robots.txt sitemap.xml LICENSE ./

# 自訂 404 與靜態資源快取
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  error_page 404 /404.html;\n\
  location / { try_files $uri $uri/ =404; }\n\
  location ~* \\.(png|jpg|jpeg|svg|css|js)$ { expires 7d; add_header Cache-Control "public"; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
