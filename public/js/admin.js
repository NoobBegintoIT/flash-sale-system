 $$ = (s) => [...document.querySelectorAll(s)];
 function enforceAdminAccess() {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) {
    window.location.href = '/login.html';
    return false;
  }

  if (user.role !== 'admin') {
    alert('Bạn không có quyền truy cập trang quản trị.');
    window.location.href = '/index.html';
    return false;
  }

  return true;
}

if (!enforceAdminAccess()) {
  throw new Error('ADMIN_ACCESS_REQUIRED');
}
let currentPage='dashboard', selectedSale='', productCache=[], saleCache=[];
let statsRange='month';
const money=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(n)||0);
const date=v=>v?new Date(v).toLocaleString('vi-VN'):'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function adminApi(path, opt = {}) {
  const token = getToken();

  if (!token) {
    window.location.href = '/';
    throw new Error('Chưa đăng nhập.');
  }

  const r = await fetch('/api' + path, {
    method: opt.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: opt.body
      ? JSON.stringify(opt.body)
      : undefined
  });

  const data = await r.json().catch(() => ({}));

  if (r.status === 401) {
    clearToken();
    clearCurrentUser();

    alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    window.location.href = '/';

    throw new Error('TOKEN_EXPIRED');
  }

  if (r.status === 403) {
    throw new Error('Bạn không có quyền Admin.');
  }

  if (!r.ok || data.success === false) {
    throw new Error(
      data.message ||
      data.error ||
      `HTTP ${r.status}`
    );
  }

  return data;
}
function enforceAdminAccess() {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) {
    window.location.href = '/login.html';
    return false;
  }

  if (user.role !== 'admin') {
    alert('Bạn không có quyền truy cập trang quản trị.');
    window.location.href = '/index.html';
    return false;
  }

  return true;
}

if (!enforceAdminAccess()) {
  throw new Error('ADMIN_ACCESS_REQUIRED');
}
function toast(msg,bad=false){const t=$('#toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');setTimeout(()=>t.className='toast',3500);}
function empty(msg){return `<div class="empty-state"><span>⌁</span><b>${esc(msg)}</b></div>`;}
function table(headers,rows){if(!rows.length)return empty('Chưa có dữ liệu');return `<table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;}
function status(s){const cls={confirmed:'green',active:'green',connected:'green',scheduled:'blue',pending:'amber',failed:'red',ended:'gray',cancelled:'gray'}[s]||'gray';return `<span class="status status-${cls}">${esc(s||'unknown')}</span>`;}
function metric(label,value,sub,icon,accent='blue'){return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon ${accent}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-sub">${sub||''}</div></article>`;}
function showPage(page){
  const labels={dashboard:'Tổng quan',products:'Sản phẩm',campaigns:'Chiến dịch',orders:'Đơn hàng',stats:'Thống kê',inventory:'Kho & Redis',queue:'Queue & Worker',system:'Sức khỏe hệ thống'};
  if(!labels[page]) page='dashboard';
  currentPage=page;
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $$('.page-panel').forEach(panel=>panel.classList.toggle('active',panel.id===`page-${page}`));
  $('#crumb').textContent=labels[page];$('#page-title').textContent=page==='dashboard'?'Tổng quan hệ thống':labels[page];
  // Render the selected section immediately; API failures are shown inside that page.
  const target=$(`#page-${page}`);
  if(page==='products') $('#products-table').innerHTML='<div class="empty-state"><b>Đang tải danh sách sản phẩm…</b></div>';
  loadPage(page).catch(e=>{
    console.error(`[admin:${page}]`,e);
    const msg=`Không tải được dữ liệu: ${e.message}. Kiểm tra server/API, PostgreSQL và quyền Admin.`;
    const slot=page==='products'?'#products-table':page==='orders'?'#orders-table':page==='campaigns'?'#campaigns-table':null;
    if(slot) $(slot).innerHTML=`<div class="empty-state error-text"><b>${esc(msg)}</b><button class="btn btn-light" onclick="location.reload()">Tải lại trang</button></div>`;
    toast(msg,true);
  });
}
async function loadPage(page){if(page==='dashboard')return dashboard();if(page==='products')return products();if(page==='campaigns')return campaigns();if(page==='orders')return orders();if(page==='stats')return stats();if(page==='inventory')return inventory();if(page==='queue')return queue();if(page==='system')return health();}
async function dashboard(){const d=await adminApi('/admin/dashboard');const s=d.summary;$('#metrics').innerHTML=metric('Doanh thu hôm nay',money(s.todayRevenue),'Tổng đơn đã xác nhận','₫','green')+metric('Đơn hàng hôm nay',s.todayOrders,`${s.todayFailed} đơn lỗi`,'☷','blue')+metric('Sản phẩm',s.products,'Trong catalog','▣','purple')+metric('Chiến dịch đang mở',s.activeSales,'Đang lên lịch hoặc hoạt động','◷','orange');const q=d.queue;$('#queue-summary').innerHTML=[['Waiting',q.waiting||0,'amber'],['Active',q.active||0,'blue'],['Completed',q.completed||0,'green'],['Failed',q.failed||0,'red']].map(x=>`<div class="queue-stat"><span class="dot ${x[2]}"></span><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');$('#service-summary').innerHTML=Object.entries(d.services).map(([k,v])=>`<div class="service-row"><span>${k==='postgres'?'PostgreSQL':'Redis'}</span>${status(v)}</div>`).join('');const o=await adminApi('/admin/orders?limit=5');$('#recent-orders').innerHTML=table(['Mã đơn','Sản phẩm','Khách hàng','Thành tiền','Trạng thái','Thời gian'],o.orders.map(x=>`<tr><td class="mono">${esc(x.id.slice(0,8))}…</td><td>${esc(x.product_name)}</td><td>${esc(x.user_id)}</td><td>${money(x.unit_price*x.quantity)}</td><td>${status(x.status)}</td><td>${date(x.created_at)}</td></tr>`));}

async function stats(){
  const d=await adminApi('/admin/stats?range='+encodeURIComponent(statsRange));
  const s=d.summary;
  $('#stats-metrics').innerHTML=
    metric('Doanh thu',money(s.revenue),'Đơn đã xác nhận','₫','green')+
    metric('Confirmed',s.confirmed,'Đơn thành công','✓','blue')+
    metric('Pending',s.pending,'Đang xử lý','◷','orange')+
    metric('Failed',s.failed,'Đơn lỗi','!','red');

  $('#stats-caption').textContent=statsRange==='day'?'Theo giờ trong hôm nay':statsRange==='month'?'Theo ngày trong tháng này':'Theo tháng trong năm nay';

  const rows=d.series||[];
  const max=Math.max(1,...rows.map(x=>Number(x.revenue)||0));
  $('#stats-chart').innerHTML=rows.length?rows.map(x=>{
    const h=Math.max(4,Math.round((Number(x.revenue)||0)/max*180));
    const label=new Date(x.bucket).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
    return `<div class="chart-col"><div class="chart-value">${money(x.revenue)}</div><div class="chart-bar" style="height:${h}px"></div><div class="chart-label">${esc(label)}</div></div>`;
  }).join(''):empty('Chưa có dữ liệu trong khoảng thời gian này');

  $('#stats-table').innerHTML=table(['Mốc thời gian','Confirmed','Failed','Doanh thu'],rows.map(x=>`<tr><td>${date(x.bucket)}</td><td>${x.confirmed}</td><td>${x.failed}</td><td>${money(x.revenue)}</td></tr>`));
}

async function products(){const q=encodeURIComponent($('#product-search').value||'');const d=await adminApi('/admin/products?q='+q+'&limit=100');productCache=d.products;$('#products-table').innerHTML=table(['Sản phẩm','Giá niêm yết','Ngày tạo','Thao tác'],d.products.map(p=>`<tr><td><div class="product-cell"><div class="product-thumb">▣</div><div><b>${esc(p.name)}</b><small>#${p.id} · ${esc(p.image_url||'Chưa có ảnh')}</small></div></div></td><td>${money(p.price)}</td><td>${date(p.created_at)}</td><td><button class="mini-btn" data-edit-product="${p.id}">Sửa</button><button class="mini-btn danger" data-delete-product="${p.id}">Xóa</button></td></tr>`));$$('[data-edit-product]').forEach(b=>b.onclick=()=>productModal(productCache.find(p=>p.id==b.dataset.editProduct)));$$('[data-delete-product]').forEach(b=>b.onclick=async()=>{const p=productCache.find(p=>p.id==b.dataset.deleteProduct);if(!confirm(`Xóa sản phẩm ${p.name}?`))return;try{await adminApi('/admin/products/'+p.id,{method:'DELETE'});toast('Đã xóa sản phẩm');products();}catch(e){toast(e.message,true);}});}
function openModal(title,fields,onSave){$('#modal-title').textContent=title;$('#modal-fields').innerHTML=fields.map(f=>`<label class="field ${f.full?'full':''}"><span>${f.label}</span>${f.type==='textarea'?`<textarea name="${f.name}" ${f.required?'required':''}>${esc(f.value||'')}</textarea>`:f.type==='select'?`<select name="${f.name}" ${f.required?'required':''}>${(f.options||[]).map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(f.value??'')?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`:`<input name="${f.name}" type="${f.type||'text'}" value="${esc(f.value??'')}" ${f.required?'required':''} ${f.step?`step="${f.step}"`:''} ${f.min!==undefined?`min="${f.min}"`:''}>`}</label>`).join('');$('#modal').classList.add('open');$('#modal-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await onSave(data);$('#modal').classList.remove('open');toast('Lưu dữ liệu thành công');loadPage(currentPage);}catch(err){toast(err.message,true);}};}
function productModal(p){openModal(p?'Cập nhật sản phẩm':'Thêm sản phẩm',[{name:'name',label:'Tên sản phẩm',value:p?.name,required:true,full:true},{name:'price',label:'Giá (VND)',type:'number',step:'1',min:1,value:p?.price,required:true},{name:'image_url',label:'URL hình ảnh',value:p?.image_url||''}],d=>adminApi('/admin/products'+(p?'/'+p.id:''),{method:p?'PUT':'POST',body:{...d,price:Number(d.price)}}));}
async function campaigns(){const d=await adminApi('/admin/campaigns');saleCache=d.sales;$('#campaigns-table').innerHTML=table(['Chiến dịch','Thời gian bắt đầu','Kết thúc','Sản phẩm','Trạng thái','Thao tác'],d.sales.map(s=>`<tr><td><b>${esc(s.name)}</b><small class="subline">ID #${s.id}</small></td><td>${date(s.start_time)}</td><td>${date(s.end_time)}</td><td>${s.product_count}</td><td>${status(s.status)}</td><td><button class="mini-btn" data-add-sale-item="${s.id}">＋ Thêm SP</button></td></tr>`));$$('[data-add-sale-item]').forEach(b=>b.onclick=()=>saleItemModal(Number(b.dataset.addSaleItem)));$('#sale-select').innerHTML=d.sales.map(s=>`<option value="${s.id}">#${s.id} ${esc(s.name)}</option>`).join('');if(!selectedSale||!d.sales.some(s=>s.id==selectedSale))selectedSale=d.sales[0]?.id||'';$('#sale-select').value=selectedSale;}
function campaignModal(){openModal('Tạo chiến dịch Flash Sale',[{name:'name',label:'Tên chiến dịch',required:true,full:true},{name:'start_time',label:'Bắt đầu',type:'datetime-local',required:true},{name:'end_time',label:'Kết thúc',type:'datetime-local',required:true},{name:'status',label:'Trạng thái',value:'scheduled',required:true}],d=>adminApi('/admin/campaigns',{method:'POST',body:{...d,start_time:new Date(d.start_time).toISOString(),end_time:new Date(d.end_time).toISOString()}}));}
async function saleItemModal(saleId){try{const d=await adminApi('/admin/products?limit=100');if(!d.products.length)return toast('Hãy tạo sản phẩm trước',true);openModal('Thêm sản phẩm vào chiến dịch',[{name:'product_id',label:'Sản phẩm',type:'select',options:d.products.map(p=>({value:p.id,label:`#${p.id} ${p.name} — ${money(p.price)}`})),required:true,full:true},{name:'sale_price',label:'Giá Flash Sale (VND)',type:'number',min:1,required:true},{name:'stock',label:'Tồn kho Flash Sale',type:'number',min:1,required:true},{name:'limit_per_user',label:'Giới hạn mỗi người',type:'number',min:1,value:1,required:true}],d=>adminApi(`/admin/campaigns/${saleId}/items`,{method:'POST',body:{product_id:Number(d.product_id),sale_price:Number(d.sale_price),stock:Number(d.stock),limit_per_user:Number(d.limit_per_user)}}));}catch(e){toast(e.message,true);}}
async function orders(){const d=await adminApi('/admin/orders?limit=100&status='+encodeURIComponent($('#order-filter').value));$('#orders-table').innerHTML=table(['Mã đơn','Sản phẩm','Khách hàng','SL','Đơn giá','Trạng thái','Lỗi','Thời gian'],d.orders.map(o=>`<tr><td class="mono">${esc(o.id.slice(0,12))}…</td><td>${esc(o.product_name)}</td><td>${esc(o.user_id)}</td><td>${o.quantity}</td><td>${money(o.unit_price)}</td><td>${status(o.status)}</td><td>${esc(o.failure_reason||'—')}</td><td>${date(o.created_at)}</td></tr>`));}
async function inventory(){const d=await adminApi('/flash-sales');const all=[];for(const s of d.sales){try{const x=await adminApi(`/admin/sales/${s.id}/stats`);x.items.forEach(i=>all.push({...i,sale_name:s.name,sale_id:s.id}));}catch{}}$('#inventory-table').innerHTML=table(['Chiến dịch','Sản phẩm','Tồn Redis','Tồn DB','Đã xác nhận','Đơn lỗi','Chênh lệch'],all.map(i=>{const redis=Number(i.redis_stock??0),db=Number(i.db_stock??0);return `<tr><td>${esc(i.sale_name)}</td><td>${esc(i.name)}</td><td>${redis}</td><td>${db}</td><td>${i.confirmed}</td><td>${i.failed}</td><td>${status(redis===db?'synced':'check '+(redis-db))}</td></tr>`;}));}
async function queue(){const d=await adminApi('/admin/queue');$('#queue-metrics').innerHTML=metric('Waiting',d.counts.waiting||0,'Đang chờ','◷','orange')+metric('Active',d.counts.active||0,'Đang xử lý','↻','blue')+metric('Completed',d.counts.completed||0,'Hoàn tất','✓','green')+metric('Failed',d.counts.failed||0,'Cần kiểm tra','!','red');$('#failed-jobs').innerHTML=table(['Job ID','Tên job','Lần thử','Lý do lỗi','Thời điểm','Thao tác'],d.failed.map(j=>`<tr><td class="mono">${esc(j.id)}</td><td>${esc(j.name)}</td><td>${j.attemptsMade}</td><td class="error-text">${esc(j.failedReason||'—')}</td><td>${date(j.timestamp)}</td><td><button class="mini-btn" data-retry-job="${esc(j.id)}">Retry</button></td></tr>`));$$('[data-retry-job]').forEach(b=>b.onclick=async()=>{try{await adminApi('/admin/queue/'+encodeURIComponent(b.dataset.retryJob)+'/retry',{method:'POST'});toast('Đã đưa job trở lại queue');queue();}catch(e){toast(e.message,true);}});}
async function health(){const d=await adminApi('/admin/health');$('#health-cards').innerHTML=metric('PostgreSQL',status(d.services.postgres),'Database','▤','green')+metric('Redis',status(d.services.redis),'Cache & Queue','▣','green')+metric('Redis memory',esc(d.redis.memory),'Bộ nhớ đang sử dụng','◫','purple')+metric('Uptime',Math.floor(d.uptime)+'s','Thời gian chạy process','◷','blue');$('#runtime-info').textContent=JSON.stringify({node:d.node,uptime_seconds:d.uptime,services:d.services,redis:d.redis},null,2);}
document.addEventListener('click',e=>{const nav=e.target.closest('.nav-item[data-page]');if(nav){e.preventDefault();showPage(nav.dataset.page);return;}const go=e.target.closest('[data-goto]');if(go){e.preventDefault();showPage(go.dataset.goto);}});$('#logout-btn').onclick = () => {
  clearToken();
  clearCurrentUser();

  window.location.href = '/login.html';
};$('#refresh-all').onclick=()=>loadPage(currentPage).then(()=>toast('Đã làm mới dữ liệu')).catch(e=>toast(e.message,true));$('#dismiss-notice').onclick=()=>$('.notice').remove();$('#modal-close').onclick=$('#modal-cancel').onclick=()=>$('#modal').classList.remove('open');$('#add-product').onclick=()=>productModal();$('#add-campaign').onclick=campaignModal;$('#product-search').oninput=()=>products().catch(e=>toast(e.message,true));$('#stats-range').onchange=e=>{statsRange=e.target.value;stats().catch(err=>toast(err.message,true));};$('#stats-refresh').onclick=()=>stats().catch(e=>toast(e.message,true));$('#order-filter').onchange=()=>orders().catch(e=>toast(e.message,true));$('#sale-select').onchange=e=>selectedSale=e.target.value;$('#warmup').onclick=async()=>{if(!selectedSale)return toast('Chọn chiến dịch trước',true);try{const d=await adminApi(`/flash-sales/${selectedSale}/warmup`,{method:'POST'});$('#operation-msg').textContent=`Đã nạp ${d.itemsWarmedUp} sản phẩm vào Redis`;toast('Warmup hoàn tất');inventory();}catch(e){toast(e.message,true);}};$('#reset').onclick=async()=>{if(!selectedSale||!confirm('Reset sẽ xóa đơn của chiến dịch và nạp lại kho. Tiếp tục?'))return;try{await adminApi(`/admin/sales/${selectedSale}/reset`,{method:'POST'});toast('Đã reset demo');loadPage(currentPage);}catch(e){toast(e.message,true);}};$('#inventory-refresh').onclick=()=>inventory().catch(e=>toast(e.message,true));$('#queue-refresh').onclick=()=>queue().catch(e=>toast(e.message,true));$('#health-refresh').onclick=()=>health().catch(e=>toast(e.message,true));
// Tự làm mới dữ liệu đang xem mỗi 5 giây để đơn mua từ trang cửa hàng
// xuất hiện ở Admin mà không cần tải lại trang. Tránh gọi API khi tab ẩn.
let refreshBusy = false;
setInterval(async () => {
  if (document.hidden || refreshBusy) return;
  refreshBusy = true;
  try { await loadPage(currentPage); }
  catch (e) { console.warn('[admin live refresh]', e.message); }
  finally { refreshBusy = false; }
}, 5000);

showPage('dashboard');
