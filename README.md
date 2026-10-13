# Hardening Container — solução da atividade

Implementação das 8 etapas de `docs/atividade.md`. Detalhes e respostas em [HARDENING.md](HARDENING.md).

## Executar

1. Crie `.env` a partir de `.env.example` e preencha valores fortes. Para a entrega local, este arquivo é fornecido separadamente e **não deve ir ao GitHub**.
2. Rode `docker compose config -q` para validar as referências das variáveis.
3. Rode `docker compose up -d --build`.
4. Abra <http://127.0.0.1:3000> (`Olá mundo!`) e <http://127.0.0.1:3000/health> (`OK`).
5. Rode `docker compose exec app id` para verificar o usuário não-root.
6. Para finalizar: `docker compose down` (preserva dados) ou `docker compose down -v` (apaga também o volume do banco).

O MySQL fica somente na rede Docker interna e não publica a porta 3306. A aplicação de exemplo apenas serve HTTP; não consulta o banco. A execução Docker deve ser validada no computador do aluno; este pacote não inclui provas de testes de runtime.

## Entrega

Publicar no fork os arquivos de `solucao-hardening-container.zip` (sem `.env`) e entregar o ZIP local de ambiente separadamente, conforme o enunciado do professor. **Nunca fazer commit de `.env`**.
