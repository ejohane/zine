#!/usr/bin/env python3
"""Build illustrative /v1 response fixtures around the existing local sample metadata.
These are mock personal states, generated understanding, materials and subscriptions;
not a snapshot of API account state or claims about the original source's contents.
"""
import json
from pathlib import Path
app=Path(__file__).resolve().parents[1]
samples=json.loads((app/'Resources/DevSamples.json').read_text())
time='2026-11-09T12:00:00.000Z'
ids=[s['id'].upper() for s in samples]
notes=['For a quieter way to think about practice and attention.', 'Come back to the hardware discussion on the next walk.', 'An idea for how to build products with more care.', 'Useful context for the agent workflow I am exploring.']
items=[]; details={}
for n,s in enumerate(samples):
 typ={'Articles':'article','Podcasts':'podcast_episode','Videos':'video','Posts':'post'}[s['section']]
 topics=['attention','craft'] if n in [0,6,18] else ['AI','design'] if s['section'] in ['Articles','Posts','Videos'] else ['technology','product']
 provenance=dict(method='mock_fixture',description='Illustrative understanding from source metadata only. No full-source analysis was performed.',coverage='metadata_only',sourceCoverage='unknown',inputContributionIds=[])
 fields={'summary':dict(contributionId=f'mock_summary_{n}',category='derived',provenance=provenance),'topics':dict(contributionId=f'mock_topics_{n}',category='derived',provenance=provenance)}
 seconds=int(s['duration'].split(' min')[0])*60 if 'min' in s['duration'] and s['section'] in ['Videos','Podcasts'] else None
 content=dict(id=f'mock_content_{n}',url=s['url'],platform='spotify' if typ=='podcast_episode' else 'youtube' if typ=='video' else 'x' if typ=='post' else 'web',type=typ,title=s['title'],description=s['note'],summary=s['note'] or 'This saved reference has metadata, but no full-source summary yet.',topics=topics)
 if seconds:content['durationSeconds']=seconds
 components=[dict(component='metadata',status='available',reasonCode=None),dict(component='understanding',status='available',reasonCode=None)]
 if n==9:components[1]=dict(component='understanding',status='processing',reasonCode=None);content.pop('summary');fields.pop('summary')
 if n==10:components[1]=dict(component='understanding',status='failed',reasonCode='provider_timeout');content.pop('summary');fields.pop('summary')
 material=None
 if n in [0,1]:
  field='article' if n==0 else 'transcript'
  text='This is illustrative preview text, not a quotation from the original work. A useful collection connects what you discover with why you wanted to keep it. Leave room to revisit the idea later.'
  value=dict(text=text,coverage='partial') if n==0 else dict(language='en',segments=[dict(startSeconds=320,endSeconds=350,text='Illustrative transcript segment. This is where a passage about your saved idea would appear.'),dict(startSeconds=350,endSeconds=390,text='A second sample passage shows how a timestamp can take you back to a useful moment.')])
  material=dict(field=field,value=value,provenance=dict(method='mock_fixture',description='Synthetic reading/transcript sample for layout only; not the author’s or speaker’s words.',sourceCoverage='partial',inputContributionIds=[]))
  components.append(dict(component=field,status='available',reasonCode=None))
 elif typ in ['podcast_episode','video']:
  components.append(dict(component='transcript',status='unavailable',reasonCode='transcript_not_available'))
 elif typ=='article':components.append(dict(component='article',status='pending' if n==6 else 'unavailable',reasonCode=None if n==6 else 'source_access_limited'))
 context=[dict(id=f'mock_context_{n}',text=notes[n%4],origin='explicit',contributor='mock-experience',createdAt=time,updatedAt=time)] if n<10 else []
 progress=dict(position=.28 if n==0 else 320 if n==1 else None,unit='fraction' if n==0 else 'seconds' if n==1 else None,completedAt=time if n==12 else None,updatedAt=time)
 collectionIds=['craft'] if n in [0,2,6,18] else ['ai-design'] if n in [3,4,5,7,8,9,13,14,15,16,21] else []
 if n==6:collectionIds.append('ai-design')
 item=dict(id=ids[n],status='received' if n in [18,20] else 'saved',archived=n==21,createdAt=time,savedAt=None if n in [18,20] else time,updatedAt=time,revision=1,content=content,context=context,tags=topics,collectionIds=collectionIds,progress=progress,enrichment=dict(fields=fields,components=components),occurrences=[dict(id=f'mock_occurrence_{n}',route='subscription' if n in [18,20] else 'save',contributor='mock-experience',subscriptionId='following-craft' if n==18 else 'following-video' if n==20 else None,createdAt=time)])
 items.append(item)
 annotations=[]
 if n==0:annotations=[dict(id='mock_highlight',kind='highlight',text='A sample thought to revisit.',anchor=dict(type='text',exact='A useful collection connects what you discover with why you wanted to keep it.'),contributor='mock-experience',createdAt=time,updatedAt=time)]
 if n==1:annotations=[dict(id='mock_timestamp',kind='timestamp',text='The part to come back to on a walk.',anchor=dict(type='time',startSeconds=320,endSeconds=350),contributor='mock-experience',createdAt=time,updatedAt=time)]
 related=[]
 if n in [0,3,6]:
  target=6 if n==0 else 4 if n==3 else 0
  related=[dict(id=f'mock_relation_{n}',kind='related',direction='outgoing',source=dict(itemId=ids[n],url=s['url']),target=dict(itemId=ids[target],contentId=f'mock_content_{target}',url=samples[target]['url'],platform='web',type='article' if target!=4 else 'post'),contributor='mock-experience',provenance=dict(method='mock_fixture',description='Illustrative personal connection, not identity reconciliation.',inputContributionIds=[]),createdAt=time,updatedAt=time)]
 details[ids[n]]=dict(annotations=dict(annotations=annotations),relationships=dict(relationships=related,nextCursor=None),jobs=dict(jobs=[dict(id=f'mock_job_{n}',kind='enrich',status='running' if n==9 else 'failed',attempts=1,errorCode=None if n==9 else 'provider_timeout',createdAt=time,updatedAt=time,itemId=ids[n],availableAt=time)] if n in [9,10] else []))
 if material:details[ids[n]]['material']=material
collections=[dict(id='craft',name='A little more intentional',description='Practice, attention, and making things with care.',createdAt=time,updatedAt=time,notes=[dict(id='mock_synthesis_craft',text='Sample synthesis: these saves connect deliberate practice with how we return to the things we value.',itemIds=[ids[0],ids[6]],contributor='mock-experience',createdAt=time,updatedAt=time)]),dict(id='ai-design',name='Designing with AI',description='Tools, taste, and working alongside agents.',createdAt=time,updatedAt=time,notes=[dict(id='mock_synthesis_ai',text='Sample synthesis: the collection brings together product judgment, agent workflows, and the value of keeping a critical eye.',itemIds=[ids[3],ids[5]],contributor='mock-experience',createdAt=time,updatedAt=time)])]
sources=[dict(id='source-craft',url='https://disquiet.com/',name='Disquiet',platform='web',routes=[dict(id='route-craft',url='https://disquiet.com/feed/',kind='rss')]),dict(id='source-video',url='https://www.youtube.com/@thenineclub',name='The Nine Club',platform='youtube',routes=[dict(id='route-video',url='https://www.youtube.com/@thenineclub',kind='youtube_channel')])]
subscriptions=[dict(id='following-craft' if n==0 else 'following-video',sourceId=s['id'],routeId=s['routes'][0]['id'],autoSave=n==1,filters={},status='active',initialized=True,nextPollAt='2026-11-09T12:15:00.000Z',lastSuccessAt=time if n==0 else None,lastErrorCode=None if n==0 else 'provider_cooldown',createdAt=time,updatedAt=time) for n,s in enumerate(sources)]
searches=[]
for query,indices in [('designing with AI',[3,4,5,8,13]),('attention and craft',[0,6])]:
 results=[]
 for n in indices:
  result=dict(items[n]);result['matches']=[dict(field='context' if items[n]['context'] else 'topics',excerpt=items[n]['context'][0]['text'] if items[n]['context'] else ', '.join(items[n]['tags']),matchedBy=['semantic'])];results.append(result)
 searches.append(dict(query=query,response=dict(items=results,nextCursor=None,index=dict(pendingItems=2,eventuallyConsistent=True))))
ordered={c['id']:dict(items=[dict(position=p,item=item) for p,item in enumerate(reversed([i for i in items if c['id'] in i['collectionIds']]))],nextCursor=None) for c in collections}
fixture=dict(itemList=dict(items=items,nextCursor=None),collectionList=dict(collections=collections,nextCursor=None),sourceList=dict(sources=sources,nextCursor=None),subscriptionList=dict(subscriptions=subscriptions,nextCursor=None),details=details,searches=searches,orderedCollections=ordered)
(app/'Resources/APIPreview.json').write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n')
print(f'Wrote mock /v1 fixtures: {len(items)} items, {len(collections)} collections, {len(subscriptions)} subscriptions.')
