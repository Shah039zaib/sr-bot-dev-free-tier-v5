(async function(){
  function el(q){ return document.querySelector(q); }
  async function api(path, opts={}) {
    const token = localStorage.getItem('adm_token')||'';
    opts.headers = opts.headers || {};
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/admin'+path, opts);
    return res.json();
  }
  document.getElementById('loginBtn').onclick = async () => {
    const u = prompt('username'); const p = prompt('password');
    const res = await fetch('/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const j = await res.json();
    if (j.token){ localStorage.setItem('adm_token', j.token); alert('Logged in'); loadOrders(); } else alert('Login failed');
  };
  window.loadOrders = async ()=> {
    const data = await api('/orders?status=pending');
    const container = el('#orders');
    container.innerHTML = '';
    (data||[]).forEach(o=>{
      const div = document.createElement('div');
      div.className='p-4 bg-white rounded shadow mb-2 flex justify-between items-center';
      div.innerHTML = `<div><b>${o.user_phone}</b><div class="text-sm text-gray-600">${o.amount} PKR • ${o.status}</div></div>
      <div><button class="px-3 py-1 bg-green-600 text-white rounded" onclick="confirmOrder(${o.id})">Confirm</button></div>`;
      container.appendChild(div);
    });
  };
  window.confirmOrder = async (id) => {
    const token = localStorage.getItem('adm_token')||'';
    const ref = prompt('Payment ref (optional)');
    await fetch('/admin/orders/'+id+'/confirm',{method:'POST',headers:{'content-type':'application/json', Authorization: `Bearer ${token}`},body:JSON.stringify({payment_ref:ref})});
    loadOrders();
  };
})();
