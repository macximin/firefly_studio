"""Presentation-only recovery of numbered sections and plain pipe tables."""
import re

def normalize_document(text):
 lines=text.splitlines();out=[];i=0
 while i<len(lines):
  line=lines[i]
  if re.match(r'^[1-9]\.\s+',line):line='## '+line
  if '|' in line and not line.startswith('|'):
   group=[]
   while i<len(lines) and '|' in lines[i] and not lines[i].startswith('|'):
    group.append(lines[i]);i+=1
   if len(group)>=2:
    rows=['| '+l.strip()+' |' for l in group];columns=len(group[0].split('|'))
    out.extend([rows[0],'| '+' | '.join(['---']*columns)+' |',*rows[1:]])
   else:out.extend(group)
   continue
  out.append(line);i+=1
 return '\n'.join(out).strip()

def content_tokens(text):
 # Presentation-only symbols ignored; every other character must retain order.
 return re.sub(r'[\s#|*-]','',text)
