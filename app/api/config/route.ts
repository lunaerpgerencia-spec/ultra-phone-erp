export async function GET() {
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const safe=!!url&&!!key&&url.startsWith('https://')&&key.startsWith('sb_publishable_');
 return Response.json({url:safe?url:null,key:safe?key:null,configured:safe},{headers:{'Cache-Control':'no-store'}});
}
