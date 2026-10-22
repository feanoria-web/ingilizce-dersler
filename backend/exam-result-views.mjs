const failure=(status,message)=>{throw Object.assign(new Error(message),{status});};

// A page instance keeps this UUID for retries. The authenticated student identity
// and receipt time come from the server; this records a page visit, not exam reading.
export async function recordExamResultView(env,studentId,viewId) {
  if(typeof viewId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(viewId))failure(400,'Geçersiz görüntüleme kimliği.');
  const id=viewId.toLowerCase(),now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO exam_result_views(student_id,view_id,created_at) VALUES(?,?,?)').bind(studentId,id,now),
    // The namespace cannot be submitted as an eventId through the generic events
    // API. Both records commit together and keep the original time on retries.
    env.DB.prepare(`INSERT OR IGNORE INTO events(event_id,student_id,type,lesson,activity,created_at)
      SELECT 'exam-results-view:'||view_id,student_id,'exam_results_view','panel','exam-results',created_at
      FROM exam_result_views WHERE student_id=? AND view_id=?`).bind(studentId,id),
  ]);
}

export async function adminExamResultViews(env) {
  const {results=[]}=await env.DB.prepare(`SELECT s.id,s.name,s.group_name,COUNT(v.view_id) AS view_count,
    MIN(v.created_at) AS first_viewed_at,MAX(v.created_at) AS last_viewed_at
    FROM students s LEFT JOIN exam_result_views v ON v.student_id=s.id
    WHERE s.enabled=1 GROUP BY s.id`).all();
  const students=results.map(s=>({id:s.id,name:s.name,group:s.group_name,viewCount:s.view_count,
    firstViewedAt:s.first_viewed_at,lastViewedAt:s.last_viewed_at,hasViewed:s.view_count>0}));
  students.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  const viewed=students.filter(s=>s.hasViewed).length;
  return {students,stats:{total:students.length,viewed,notViewed:students.length-viewed}};
}
