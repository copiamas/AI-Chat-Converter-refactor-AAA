document.querySelector('#content').hidden = false;
document.querySelector('#action').addEventListener('click', () => {
  document.querySelector('#interactive').textContent = 'Interação funcionando';
});
