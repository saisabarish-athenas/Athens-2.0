path = 'e:/Athens 5.0/Athens 2.0/backend/workforce/views.py'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()
print('Before:', len(lines))
# Remove lines 1019-1293 (0-indexed) = first duplicate block
new_lines = lines[:1019] + lines[1294:]
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.writelines(new_lines)
print('After:', len(new_lines))
