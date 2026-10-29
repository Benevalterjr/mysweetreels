import sys
import json
import os
import cv2
import urllib3
urllib3.disable_warnings()
import requests

old_merge = requests.Session.merge_environment_settings
def no_ssl(self, url, proxies, stream, verify, cert):
    return old_merge(self, url, proxies, stream, False, cert)
requests.Session.merge_environment_settings = no_ssl

import yt_dlp

def download_reel(url, out_video_path, out_thumb_path):
    ydl_opts = {
        'cookiesfrombrowser': ('firefox',),
        'nocheckcertificate': True,
        'outtmpl': out_video_path,
        'format': 'mp4/best',
        'quiet': True,
        'no_warnings': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        
        # Extrai frame de alta qualidade para a capa (thumbnail) usando cv2
        thumb_url = None
        try:
            os.makedirs(os.path.dirname(out_thumb_path), exist_ok=True)
            cap = cv2.VideoCapture(out_video_path)
            cap.set(cv2.CAP_PROP_POS_MSEC, 1500)
            success, frame = cap.read()
            if success:
                cv2.imwrite(out_thumb_path, frame)
                thumb_url = '/' + out_thumb_path.replace('public/', '').replace('public\\', '').replace('\\', '/')
            cap.release()
        except Exception as e:
            pass

        meta = {
            'id': info.get('id'),
            'title': info.get('title'),
            'thumbnail': thumb_url,
            'channel': info.get('channel'),
            'uploader': info.get('uploader'),
            'uploader_url': f"https://www.instagram.com/{info.get('uploader')}/" if info.get('uploader') else None,
            'duration': info.get('duration')
        }
        return meta

if __name__ == '__main__':
    url = sys.argv[1]
    out_video = sys.argv[2]
    out_thumb = sys.argv[3] if len(sys.argv) > 3 else 'public/thumbnails/thumb.jpg'
    meta = download_reel(url, out_video, out_thumb)
    print("###META_START###" + json.dumps(meta) + "###META_END###")

