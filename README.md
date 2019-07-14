<p align="center">
    <img src="https://i.imgur.com/2Ax3HgL.png" alt="Logo de GameIndus" width="600">
</p>

<h1 align="center">Collection of APIs</h1>
<h4 align="center">
A collection of APIs used by the collaborative editor
</h4>

<p align="center">
    <a href="https://github.com/GameIndus/apis/commits/develop">
        <img src="https://img.shields.io/github/last-commit/GameIndus/apis/master.svg" alt="GitHub last commit">
    </a>
    <a href="https://github.com/GameIndus/apis/blob/master/LICENSE.md">
        <img src="https://img.shields.io/badge/License-GPL--3.0-green.svg" alt="License">
    </a>
</p>

>
> This collection is **very old** and **very poorly-made**. So we advise to do not copy the source code without understanding it.
> Originally developed by [Utarwyn](https://github.com/utarwyn). 
>

### Modules

This collection contains many modules which run independently. Each file in the `src` folder can be runned by the node executable.

- **compiler**: used to compile a project and all of its resources. (creation of an executable game)
- **devzone**: used by administrators to obtain statuses and logs of all others APIs.
- **enginesRenderer**: create and provide engines for all games.
- **main**: main server of the editor. Each action with it is handle by this API.
- **realtime**: used by the editor to provide a collaboration interface for users in projects.
- **tchat**: a tchat module to talk with other users.

> :warning: You have to rename the file `config.sample.json` to `config.json` to have a proper configuration to run all APIs.

### License

This content is released under the (https://opensource.org/licenses/GPL-3.0) GPL-3.0 License.\
See [LICENSE](https://github.com/GameIndus/apis/blob/master/LICENSE) file

---

> GitHub [@Gameindus](https://github.com/gameindus) &nbsp;&middot;&nbsp;
> Twitter [@GameIndus](https://twitter.com/GameIndus)
