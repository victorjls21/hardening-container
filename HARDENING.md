# Relatório de Hardening de Containers

## Contexto e análise inicial

O projeto original continha `Dockerfile`, `docker-compose.yml`, `app/server.js` e `app/package.json` vazio. O script original apenas executava `console.log("Olá mundo!")` e encerrava; portanto, **não era um servidor HTTP funcional**, embora a porta 3000 estivesse publicada. A verificação anterior às alterações foi **estática**, porque não há engine Docker disponível no ambiente de preparação deste pacote. Não se deve interpretar esta análise como teste de execução prévia.

| Local | Problema original | Risco |
| --- | --- | --- |
| `Dockerfile` | `ubuntu:latest` | Build não reprodutível; versão flutuante e imagem com componentes dispensáveis. |
| `Dockerfile` | `apt-get install -y nodejs npm` | Instala ferramenta e dependências do sistema não necessárias em execução; maior superfície de ataque. |
| `Dockerfile` | `COPY . .` antes de instalar dependências | Copia todos os arquivos do contexto (inclusive segredos, se existirem) e aumenta a imagem. |
| `Dockerfile` | `RUN npm install` sem package válido | A pasta `app/package.json` estava vazia, e não existia `package.json` na raiz; o build original provavelmente falharia. |
| `Dockerfile` | Execução sem `USER` | Processo por padrão pode executar como root do container. |
| `Dockerfile` | `ENV DB_PASSWORD=123456` | Senha gravada nos metadados/camadas e no histórico de imagem. |
| `docker-compose.yml` | `MYSQL_ROOT_PASSWORD: root` | Senha fraca e fixa em arquivo versionado. |
| `docker-compose.yml` | `mysql:latest` | Versão flutuante e atualizações inesperadas. |
| `docker-compose.yml` | `3306:3306` | MySQL acessível na interface do host, quando é necessário apenas na rede interna. |
| `docker-compose.yml` | Publicação `3000:3000` em todas as interfaces | Acesso à aplicação em todas as interfaces de rede do host sem necessidade para o exercício local. |
| `docker-compose.yml` | Sem limites de CPU/memória | Possibilidade de exaustão de recursos do host. |
| `docker-compose.yml` | Sem configuração de isolamento | Mais permissões e superfície de ataque do que o necessário. |

## Medidas aplicadas

1. **Imagem menor e versionada:** `node:22-alpine` em lugar de Ubuntu genérico; dispensa instalar `apt`, `npm` e compiladores na imagem final. Para produção estritamente reprodutível, fixar também o digest SHA-256 auditado da imagem e planejar atualizações.
2. **Usuário sem privilégios:** `USER node` (usuário não-root fornecido pela imagem Node). `COPY --chown=node:node` concede propriedade adequada aos arquivos usados pelo processo.
3. **Build restrito:** `.dockerignore` evita enviar `.env`, `.git`, documentação, arquivos de log e outras sobras para o contexto da imagem. Não há `RUN` que embuta segredo. O aplicativo usa apenas módulos nativos do Node, então não precisa de download de dependências nem `npm install`.
4. **Gerenciamento de credenciais:** `.env` local contém valores gerados aleatoriamente; Compose referencia `${DB_PASSWORD}` e `${MYSQL_ROOT_PASSWORD}`. `.env.example` documenta somente nomes vazios. `.gitignore` ignora `.env` e variantes, exceto `.env.example`.
5. **Rede:** o serviço `banco` não publica porta ao host, e ambos se comunicam pela rede bridge `backend` via DNS `banco`. A aplicação publica `127.0.0.1:${APP_PORT:-3000}:3000` somente no loopback local; em implantação real a exposição deve ser avaliada para o contexto e protegida por proxy/TLS.
6. **Limites:** `cpus`, `mem_limit` e `pids_limit` limitam CPU, memória e processos de ambos os serviços (app: 0,5 CPU, 128 MiB e 100 PIDs; banco: 1 CPU, 512 MiB e 200 PIDs). Ajustar com medições do ambiente real.
7. **Redução de privilégios:** `no-new-privileges:true` nos dois serviços; para `app`, `cap_drop: [ALL]`, filesystem raiz `read_only: true` e diretório temporário em `tmpfs` com `noexec,nosuid`. O banco precisa de volume gravável `/var/lib/mysql` para persistência.
8. **Continuidade funcional:** o texto original `Olá mundo!` agora é entregue via HTTP em `/`, enquanto `/health` retorna `OK`. Isto é uma correção do projeto de exemplo, já que o script original terminava sem escutar a porta 3000. O banco permanece preparado, mas o aplicativo de demonstração **não realiza consultas SQL**; configurar `DB_*` não implica uso ativo da base.

## Perguntas das etapas

### Etapa 2 — Imagem menor
Uma imagem menor tem menos componentes, bibliotecas e utilitários que possam conter vulnerabilidades ou ser explorados depois de uma invasão. O tamanho sozinho não garante segurança: é necessário manter os componentes atualizados e verificar as CVEs.

### Etapa 3 — Usuário administrador
Se uma aplicação rodando como root for comprometida, o invasor pode modificar mais arquivos e processos dentro do container e ampliar o impacto. Dependendo das permissões do runtime, mounts e vulnerabilidades do kernel, isso também pode facilitar ataques ao host. Root no container não equivale automaticamente a root no host, mas eleva o risco.

### Etapa 4 — Segredos
1. `ENV` no Dockerfile persiste a senha nos metadados e pode torná-la visível a quem inspeciona a imagem.
2. Um `.env` versionado expõe segredos a quem acessa o histórico do repositório, inclusive após sua remoção superficial.
3. `.env.example` lista os nomes que devem ser configurados, sem publicar os valores reais; serve como modelo para outros desenvolvedores.
4. Uma senha literal no Compose fica registrada no arquivo versionado; usar `${VAR}` separa a configuração do valor secreto. Isso **não criptografa** o segredo: usuários com acesso ao host/Docker ainda podem inspecionar variáveis e containers. Em produção, usar um gerenciador de segredos.

### Etapa 5 — Rede
Não. Se apenas a aplicação utiliza o banco, publicar `3306` no host cria uma entrada desnecessária para ataques e tentativas de autenticação. O serviço pode ser acessado por outros containers autorizados na mesma rede Docker.

### Etapa 6 — Recursos
Sem limites, um container com vazamento de memória, loop de CPU ou ataque de negação de serviço pode degradar ou interromper processos dos outros containers e do próprio host. Limites contêm parte desse impacto (embora não sejam substitutos de monitoramento).

## Análise final — 8 respostas

1. **Principal risco:** segredos em texto puro no Dockerfile/Compose e execução com privilégios elevados, agravados pelo banco publicado ao host.
2. **Mudança mais importante:** remover segredos do código versionado e reduzir privilégios e exposição do banco. A combinação reduz a chance de comprometimento e seu impacto.
3. **Se comprometido:** um invasor poderia executar código como o usuário da aplicação, acessar variáveis de ambiente (inclusive credenciais), atingir serviços da rede `backend` e tentar explorar o banco. Os controles reduzem permissões, mas não garantem isolamento absoluto.
4. **Menor privilégio:** processo Node não-root, capabilities removidas, sem elevação de privilégios, filesystem somente leitura, serviço MySQL sem portas publicadas ao host.
5. **Por que não enviar `.env`:** para impedir exposição e persistência de credenciais no histórico Git.
6. **Função do `.env.example`:** orientar a configuração sem divulgar segredos.
7. **CI/CD:** executar `docker compose config -q` com segredos falsos de CI, linters (Hadolint), análise de vulnerabilidades de imagens (Trivy/Grype), varredura de segredos (Gitleaks), teste HTTP da aplicação e políticas de imagem assinada; bloquear merge quando testes críticos falharem. Nunca enviar `.env` real aos logs/artifacts.
8. **Kubernetes:** usar SecurityContext (`runAsNonRoot`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem`, `capabilities.drop`), Requests/Limits, NetworkPolicies, RBAC mínimo, Pod Security Admission, Secrets com criptografia e acesso mínimo, volumes restritos, admission policies e atualização contínua de imagens.

## Evidências e comandos para validação local

> **Estado da evidência:** verificação estática e sintática; a execução Docker **não foi realizada** no ambiente usado para preparar a entrega, portanto os comandos abaixo são um roteiro de testes a executar localmente. Não apresentar como prints de testes realizados.

Na raiz do projeto:

```powershell
# Se necessário, copie o exemplo e preencha segredos fortes (o ZIP local já tem .env).
# Copy-Item .env.example .env

docker compose config -q
docker compose up -d --build
docker compose ps
curl.exe http://127.0.0.1:3000/
curl.exe http://127.0.0.1:3000/health
# Usuário efetivo no container da aplicação
docker compose exec app id
# Limites e montagem de leitura
docker inspect (docker compose ps -q app) --format '{{.HostConfig.Memory}} bytes / {{.HostConfig.NanoCpus}} nanocpus / readonly={{.HostConfig.ReadonlyRootfs}}'
# Banco não deve ter porta publicada no host
docker compose port banco 3306
# Verificar se .env é ignorado pelo Git
git check-ignore .env
# Inspecionar consumo
docker stats --no-stream
```

Resultados esperados: raiz HTTP `Olá mundo!`, health `OK`, usuário `node` não-root; `docker compose port banco 3306` sem porta publicada. `docker compose ps` deve mostrar a aplicação ligada a `127.0.0.1:3000`. Se a porta 3000 estiver ocupada, altere `APP_PORT` no `.env` e ajuste as URLs.

**Observações e limitações:** o `depends_on` espera apenas o início do serviço MySQL, não sua prontidão. Como a demonstração não se conecta ao banco, isso não bloqueia a página HTTP. As senhas no `.env` são demonstrativas e devem ser rotacionadas em ambientes compartilhados. Para operação de produção, usar Docker secrets/serviço externo de segredos, TLS, backups e health checks adequados à base.
