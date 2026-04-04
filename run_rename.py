import os
import re

dir_to_scan = 'c:/Users/ayush/OneDrive/Desktop/CRAFTATHON/app'
for root, _, files in os.walk(dir_to_scan):
    for f in files:
        if f.endswith('.py'):
            filepath = os.path.join(root, f)
            with open(filepath, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Replaces
            content = content.replace('SupabaseService', 'DBService')
            content = content.replace('supabase_service', 'db_service')
            content = content.replace('_supabase', '_db')
            content = content.replace('get_supabase_service', 'get_db_service')
            
            with open(filepath, 'w', encoding='utf-8') as file:
                file.write(content)

print('Renamed all DB occurrences.')
