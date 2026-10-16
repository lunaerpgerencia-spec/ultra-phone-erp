# ULTRA PHONE ERP — Vercel

ERP com autenticação Supabase, clientes, estoque por IMEI, vendas, parcelas, recebimentos, contratos e impressão de promissórias.

## Publicação

- Repositório: `lunaerpgerencia-spec/ultra-phone-erp`, branch `main`.
- Framework: Next.js. Diretório raiz: raiz do repositório.
- Instalação: `npm ci`. Build: `npm run build`. Node.js 24.
- Configure na Vercel `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (chave pública moderna `sb_publishable_...`). Nunca use service_role.
- Supabase existente: `yoksjwpetjfkjeecxlze`. Não recrie nem reaplique `database/schema.sql` no banco existente: esse arquivo é usado pelos testes locais e não representa todas as extensões já instaladas no banco remoto.
- Os usuários já cadastrados continuam acessando pelo e-mail e senha existentes. Não há dados comerciais em localStorage.

## Uso

Em Vendas, abra Contrato para imprimir o contrato da venda. Promissórias imprime uma nota por parcela em aberto, com cliente, valor e vencimento. A impressão usa o navegador e permite salvar em PDF. Confira e preencha os campos de qualificação e assinatura antes de usar os documentos.

## Validação local

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Os testes de banco usam PostgreSQL isolado via PGlite e não gravam no Supabase de produção. A emissão é de comprovantes não fiscais; não há integração bancária para emissão de boletos.
