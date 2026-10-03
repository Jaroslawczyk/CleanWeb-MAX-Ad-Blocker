CleanWeb MAX Ad Blocker 2.0 для Microsoft Edge

УСТАНОВКА
1. Распакуйте ZIP в постоянную папку.
2. В Edge откройте edge://extensions
3. Включите «Режим разработчика».
4. Нажмите «Загрузить распакованное расширение».
5. Выберите папку CleanWeb_MAX_Edge.
6. Закрепите CleanWeb MAX на панели браузера.

ЧТО ВКЛЮЧЕНО
- статические правила против известных рекламных и трекинговых сетей;
- агрессивные third-party правила по типичным рекламным URL;
- автоматическое обновление совместимых сетевых правил из EasyList, EasyPrivacy, EasyList Polish и RU AdList;
- косметическое скрытие рекламных контейнеров и promoted/sponsored карточек;
- подавление рекламных попапов/popunder;
- обход части анти-adblock оверлеев;
- очистка UTM/gclid/fbclid и похожих параметров в ссылках;
- отдельная глубокая обработка YouTube: удаление рекламных полей из player JSON, скрытие DOM-рекламы, нажатие Skip и ускоренный пропуск;
- SponsorBlock для известных sponsor/self-promo/interaction сегментов внутри самих роликов.

ВАЖНО
Ни одно расширение не может гарантировать 100% отсутствие рекламы «везде и всегда» без риска поломки сайтов. Реклама может быть встроена в тот же поток/контент, сайты меняют код, а Manifest V3 ограничивает способы перехвата запросов. Эта версия намеренно агрессивная, но старается не блокировать main-frame навигацию.

ПРИВАТНОСТЬ
SponsorBlock-запрос использует 4-символьный префикс SHA-256 хеша YouTube video ID (k-anonymity), а не отправляет полный video ID в URL запроса.

ИСТОЧНИКИ ФИЛЬТРОВ (загружаются при работе расширения, в архив не копируются):
- https://easylist.to/easylist/easylist.txt
- https://easylist.to/easylist/easyprivacy.txt
- https://easylist-downloads.adblockplus.org/easylistpolish.txt
- https://raw.githubusercontent.com/easylist/ruadlist/master/RuAdList-uBO.txt
- SponsorBlock API: https://sponsor.ajay.app
